"use server";

import { revalidatePath } from "next/cache";

import {
  DOC_CRITERIA,
  RISK_CRITERIA,
  type DocCriterionSeed,
  type RiskCriterionSeed,
} from "@/lib/dd-defaults";
import {
  judgeCompleteness,
  type DdDeclarationForJudging,
  type DdFileForJudging,
} from "@/lib/dd-completeness";
import { readableKind, unsupportedReason } from "@/lib/dd-file-kind";
import {
  assessRisk,
  classifyDocument,
  type RiskInputDoc,
  type Verdict,
} from "@/lib/dd-screen";
import { getCurrentUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";

const BUCKET = "dd-docs";

export type ActionResult<T = undefined> =
  | ({ ok: true } & (T extends undefined ? object : { data: T }))
  | { ok: false; error: string };

function fail(error: string): { ok: false; error: string } {
  return { ok: false, error };
}

function touch() {
  revalidatePath("/dd");
}

// =============================================================================
// 배치 · 기업
// =============================================================================

/** 배치 생성 + 기본 기준 '복사'. 기준은 배치마다 독립 사본이다(마이그레이션 §2). */
export async function createBatch(
  name: string,
  note = "",
): Promise<ActionResult<string>> {
  const me = await getCurrentUser();
  if (!me) return fail("로그인이 필요합니다.");

  const trimmed = name.trim();
  if (!trimmed) return fail("배치 이름을 입력해 주세요.");

  const supabase = await createClient();
  const { data: batch, error } = await supabase
    .from("dd_batches")
    .insert({ name: trimmed, note: note.trim(), created_by: me.id })
    .select("id")
    .single();
  if (error) return fail(error.message);

  const rows = [
    ...DOC_CRITERIA.map((c, i) => ({
      batch_id: batch.id,
      kind: "doc",
      code: c.code,
      label: c.label,
      guidance: c.guidance,
      required: c.required,
      max_age_days: c.maxAgeDays,
      sort_order: i,
    })),
    ...RISK_CRITERIA.map((c, i) => ({
      batch_id: batch.id,
      kind: "risk",
      code: c.code,
      label: c.label,
      guidance: c.guidance,
      required: true,
      max_age_days: 0,
      sort_order: i,
    })),
  ];
  const { error: critError } = await supabase.from("dd_criteria").insert(rows);
  if (critError) {
    // 기준 없는 배치는 아무것도 못 한다 — 반쯤 만들어진 상태로 두지 않는다.
    await supabase.from("dd_batches").delete().eq("id", batch.id);
    return fail(`기준 생성 실패: ${critError.message}`);
  }

  touch();
  return { ok: true, data: batch.id as string };
}

export async function deleteBatch(batchId: string): Promise<ActionResult> {
  const supabase = await createClient();
  // Storage 파일은 cascade 되지 않으므로 먼저 지운다.
  const { data: companies } = await supabase
    .from("dd_companies")
    .select("id")
    .eq("batch_id", batchId);
  const ids = (companies ?? []).map((c) => c.id as string);
  if (ids.length > 0) {
    const { data: files } = await supabase
      .from("dd_files")
      .select("storage_path")
      .in("company_id", ids);
    const paths = (files ?? []).map((f) => f.storage_path as string);
    if (paths.length > 0) await supabase.storage.from(BUCKET).remove(paths);
  }

  const { error } = await supabase.from("dd_batches").delete().eq("id", batchId);
  if (error) return fail(error.message);
  touch();
  return { ok: true };
}

/** 기업명을 줄바꿈/쉼표로 구분해 한 번에 등록. 중복은 조용히 건너뛴다. */
export async function addCompanies(
  batchId: string,
  namesText: string,
): Promise<ActionResult<number>> {
  const me = await getCurrentUser();
  if (!me) return fail("로그인이 필요합니다.");

  const names = Array.from(
    new Set(
      namesText
        .split(/[\n,]/)
        .map((s) => s.trim())
        .filter(Boolean),
    ),
  );
  if (names.length === 0) return fail("기업명을 입력해 주세요.");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("dd_companies")
    .upsert(
      names.map((name) => ({ batch_id: batchId, name, created_by: me.id })),
      { onConflict: "batch_id,name", ignoreDuplicates: true },
    )
    .select("id");
  if (error) return fail(error.message);

  touch();
  return { ok: true, data: (data ?? []).length };
}

export async function deleteCompany(companyId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { data: files } = await supabase
    .from("dd_files")
    .select("storage_path")
    .eq("company_id", companyId);
  const paths = (files ?? []).map((f) => f.storage_path as string);
  if (paths.length > 0) await supabase.storage.from(BUCKET).remove(paths);

  const { error } = await supabase.from("dd_companies").delete().eq("id", companyId);
  if (error) return fail(error.message);
  touch();
  return { ok: true };
}

// =============================================================================
// 파일
// =============================================================================

/**
 * 업로드된 파일의 메타를 등록한다. 바이트 자체는 브라우저가 Storage 로 직접
 * 올린다 — 서버 액션 본문 제한(기본 1MB)에 걸리지 않고, 수십 MB 스캔 PDF 를
 * 서버 메모리로 통과시키지 않기 위해서다.
 */
export async function registerFile(args: {
  companyId: string;
  storagePath: string;
  fileName: string;
  mimeType: string;
  byteSize: number;
}): Promise<ActionResult> {
  const me = await getCurrentUser();
  if (!me) return fail("로그인이 필요합니다.");

  const kind = readableKind(args.mimeType, args.fileName);
  const supabase = await createClient();
  const { error } = await supabase.from("dd_files").insert({
    company_id: args.companyId,
    storage_path: args.storagePath,
    file_name: args.fileName,
    mime_type: args.mimeType,
    byte_size: args.byteSize,
    // 읽을 수 없는 형식은 분류 자체를 시도하지 않는다. 모델에 깨진 바이트를
    // 넣으면 그럴듯한 오답이 나온다(dd-screen 주석 참조).
    readable: kind !== "unsupported",
    classify_note: kind === "unsupported" ? unsupportedReason(args.fileName) : "",
    classified_at: kind === "unsupported" ? new Date().toISOString() : null,
    criterion_code: kind === "unsupported" ? "" : null,
    uploaded_by: me.id,
  });
  if (error) return fail(error.message);
  touch();
  return { ok: true };
}

export async function deleteFile(fileId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { data: file } = await supabase
    .from("dd_files")
    .select("storage_path")
    .eq("id", fileId)
    .maybeSingle();
  if (file) await supabase.storage.from(BUCKET).remove([file.storage_path as string]);

  const { error } = await supabase.from("dd_files").delete().eq("id", fileId);
  if (error) return fail(error.message);
  touch();
  return { ok: true };
}

/** 원본 열람용 서명 URL(10분). 버킷이 비공개라 이 경로로만 열린다. */
export async function getFileUrl(fileId: string): Promise<ActionResult<string>> {
  const supabase = await createClient();
  const { data: file } = await supabase
    .from("dd_files")
    .select("storage_path")
    .eq("id", fileId)
    .maybeSingle();
  if (!file) return fail("파일을 찾을 수 없습니다.");

  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(file.storage_path as string, 600);
  if (error || !data) return fail(error?.message ?? "URL 생성 실패");
  return { ok: true, data: data.signedUrl };
}

/** 사람이 AI 분류를 고친다. 빈 문자열 = '해당 없음'으로 지정. */
export async function setFileCategory(
  fileId: string,
  code: string,
): Promise<ActionResult> {
  const me = await getCurrentUser();
  if (!me) return fail("로그인이 필요합니다.");

  const supabase = await createClient();
  const { error } = await supabase
    .from("dd_files")
    .update({
      override_code: code,
      override_by: me.id,
      override_at: new Date().toISOString(),
    })
    .eq("id", fileId);
  if (error) return fail(error.message);
  touch();
  return { ok: true };
}

// =============================================================================
// 진술 — 파일 없이 응답한 항목
// =============================================================================

/**
 * '해당 없음' 사유 또는 '설립 후 제출 예정'을 기록한다.
 *
 * 제출 포털에서 기업이 파일 대신 사유를 적어 응답한 항목을 옮겨 담는 자리다.
 * 이게 없으면 "타법인 겸직 없음"처럼 **파일이 존재할 수 없는** 항목이 전부
 * 미제출로 떨어진다(실측: 배치 전원 탈락).
 */
export async function setDeclaration(args: {
  companyId: string;
  criterionCode: string;
  kind: "none_applicable" | "deferred";
  reason: string;
}): Promise<ActionResult> {
  const me = await getCurrentUser();
  if (!me) return fail("로그인이 필요합니다.");

  const reason = args.reason.trim();
  // 사유 없는 '해당 없음'은 심사에 쓸 수 없다 — 무엇을 근거로 없다는 건지가
  // 리스크 판정의 입력이다. deferred 는 사유가 자명해 비워 둘 수 있다.
  if (args.kind === "none_applicable" && !reason)
    return fail("'해당 없음' 사유를 입력해 주세요.");

  const supabase = await createClient();
  const { error } = await supabase.from("dd_declarations").upsert(
    {
      company_id: args.companyId,
      criterion_code: args.criterionCode,
      kind: args.kind,
      reason,
      updated_at: new Date().toISOString(),
      updated_by: me.id,
    },
    { onConflict: "company_id,criterion_code" },
  );
  if (error) return fail(error.message);

  // 응답이 바뀌면 완결성 판정도 따라가야 한다 — 수동 재실행을 요구하면
  // 화면이 옛 판정을 계속 보여 준다(AI 콜 없는 산술이라 비용도 없다).
  await runCompleteness(args.companyId);
  touch();
  return { ok: true };
}

export async function clearDeclaration(
  companyId: string,
  criterionCode: string,
): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("dd_declarations")
    .delete()
    .eq("company_id", companyId)
    .eq("criterion_code", criterionCode);
  if (error) return fail(error.message);

  await runCompleteness(companyId);
  touch();
  return { ok: true };
}

// =============================================================================
// 판정
// =============================================================================

async function loadDeclarations(
  supabase: Awaited<ReturnType<typeof createClient>>,
  companyId: string,
): Promise<DdDeclarationForJudging[]> {
  const { data } = await supabase
    .from("dd_declarations")
    .select("criterion_code, kind, reason")
    .eq("company_id", companyId);
  return (data ?? []).map((d) => ({
    criterionCode: d.criterion_code as string,
    kind: d.kind as DdDeclarationForJudging["kind"],
    reason: (d.reason as string) ?? "",
  }));
}

type CriterionRow = {
  code: string;
  label: string;
  guidance: string;
  required: boolean;
  max_age_days: number;
};

async function loadCriteria(
  supabase: Awaited<ReturnType<typeof createClient>>,
  batchId: string,
): Promise<{ doc: DocCriterionSeed[]; risk: RiskCriterionSeed[] }> {
  const { data } = await supabase
    .from("dd_criteria")
    .select("kind, code, label, guidance, required, max_age_days")
    .eq("batch_id", batchId)
    .order("sort_order");

  const rows = (data ?? []) as (CriterionRow & { kind: string })[];
  return {
    doc: rows
      .filter((r) => r.kind === "doc")
      .map((r) => ({
        code: r.code,
        label: r.label,
        guidance: r.guidance,
        required: r.required,
        maxAgeDays: r.max_age_days,
      })),
    risk: rows
      .filter((r) => r.kind === "risk")
      .map((r) => ({ code: r.code, label: r.label, guidance: r.guidance })),
  };
}

async function loadCompany(
  supabase: Awaited<ReturnType<typeof createClient>>,
  companyId: string,
) {
  const { data } = await supabase
    .from("dd_companies")
    .select("id, name, batch_id")
    .eq("id", companyId)
    .maybeSingle();
  return data as { id: string; name: string; batch_id: string } | null;
}

/** 아직 분류하지 않은 파일 목록(분류 루프의 작업 큐). */
export async function listPendingClassification(
  companyId: string,
): Promise<ActionResult<{ id: string; fileName: string }[]>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("dd_files")
    .select("id, file_name, readable, classified_at")
    .eq("company_id", companyId)
    .order("uploaded_at");
  if (error) return fail(error.message);

  const pending = (data ?? [])
    .filter((f) => !f.classified_at && f.readable !== false)
    .map((f) => ({ id: f.id as string, fileName: f.file_name as string }));
  return { ok: true, data: pending };
}

/**
 * 파일 한 건을 AI 로 분류한다.
 *
 * **한 액션이 한 파일만** 맡는 이유: 25건을 한 호출에서 돌리면 건당 수 초 × 25 로
 * 서버 함수 시간 예산을 넘길 수 있고, 중간에 끊기면 어디까지 됐는지 알 수 없다.
 * 파일 단위로 끊으면 진행률을 보여줄 수 있고, 실패한 건만 다시 돌릴 수 있다.
 * 루프는 클라이언트가 돌린다(classifyAllFiles).
 */
export async function classifyOneFile(
  fileId: string,
): Promise<ActionResult<{ fileName: string; criterionCode: string }>> {
  const supabase = await createClient();

  const { data: f } = await supabase
    .from("dd_files")
    .select("id, company_id, storage_path, file_name, mime_type, readable")
    .eq("id", fileId)
    .maybeSingle();
  if (!f) return fail("파일을 찾을 수 없습니다.");
  if (f.readable === false) return fail(unsupportedReason(f.file_name as string));

  const company = await loadCompany(supabase, f.company_id as string);
  if (!company) return fail("기업을 찾을 수 없습니다.");

  const { doc } = await loadCriteria(supabase, company.batch_id);
  if (doc.length === 0) return fail("서류 체크리스트가 비어 있습니다.");

  try {
    const { data: blob, error: dlError } = await supabase.storage
      .from(BUCKET)
      .download(f.storage_path as string);
    if (dlError || !blob) throw new Error(dlError?.message ?? "파일을 받지 못했습니다");

    const bytes = new Uint8Array(await blob.arrayBuffer());
    const { data } = await classifyDocument({
      bytes,
      mimeType: (f.mime_type as string) ?? "",
      fileName: f.file_name as string,
      companyName: company.name,
      criteria: doc,
    });

    const { error } = await supabase
      .from("dd_files")
      .update({
        criterion_code: data.criterionCode,
        doc_title: data.docTitle,
        issued_date: data.issuedDate,
        as_of_date: data.asOfDate,
        doc_company: data.docCompany,
        confidence: data.confidence,
        classify_note: data.note,
        classified_at: new Date().toISOString(),
      })
      .eq("id", fileId);
    if (error) return fail(error.message);

    return {
      ok: true,
      data: { fileName: f.file_name as string, criterionCode: data.criterionCode },
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    // 실패 사유를 남긴다 — 안 남기면 화면에 '미분류'로만 보여 원인을 알 수 없다.
    // classified_at 은 비워 둬 재시도 대상으로 남긴다.
    await supabase
      .from("dd_files")
      .update({ classify_note: `분류 실패 — ${msg}` })
      .eq("id", fileId);
    return fail(`${f.file_name}: ${msg}`);
  }
}

/** 완결성 재계산. AI 콜 없음 — 분류 결과를 코드로 집계한다. */
export async function runCompleteness(companyId: string): Promise<ActionResult> {
  const me = await getCurrentUser();
  const supabase = await createClient();
  const company = await loadCompany(supabase, companyId);
  if (!company) return fail("기업을 찾을 수 없습니다.");

  const { doc } = await loadCriteria(supabase, company.batch_id);
  const { data: fileRows } = await supabase
    .from("dd_files")
    .select(
      "id, file_name, criterion_code, override_code, issued_date, as_of_date, readable, confidence, doc_company",
    )
    .eq("company_id", companyId);

  const files: DdFileForJudging[] = (fileRows ?? []).map((f) => ({
    id: f.id as string,
    fileName: f.file_name as string,
    effectiveCode: (f.override_code as string | null) ?? (f.criterion_code as string | null),
    issuedDate: (f.issued_date as string | null) ?? null,
    asOfDate: (f.as_of_date as string | null) ?? null,
    readable: Boolean(f.readable),
    confidence: ((f.confidence as string) ?? "") as DdFileForJudging["confidence"],
    docCompany: (f.doc_company as string) ?? "",
  }));

  const result = judgeCompleteness({
    companyName: company.name,
    criteria: doc,
    files,
    declarations: await loadDeclarations(supabase, companyId),
  });

  const { error } = await supabase.from("dd_assessments").upsert(
    {
      company_id: companyId,
      stage: "completeness",
      verdict: result.verdict,
      summary: result.summary,
      details: {
        items: result.items,
        requiredMet: result.requiredMet,
        requiredTotal: result.requiredTotal,
        unmatchedFileIds: result.unmatchedFileIds,
        companyMismatches: result.companyMismatches,
      },
      model: "",
      created_at: new Date().toISOString(),
      created_by: me?.id ?? null,
    },
    { onConflict: "company_id,stage" },
  );
  if (error) return fail(error.message);

  touch();
  return { ok: true };
}

/**
 * 리스크 판정(2단계). 완결성을 통과(또는 보류)한 기업만 돌린다 —
 * 서류가 빠진 상태로 돌리면 모델이 전부 'unknown' 을 내놓고 비용만 든다.
 */
export async function runRisk(
  companyId: string,
): Promise<ActionResult<{ skipped: { fileName: string; reason: string }[] }>> {
  const me = await getCurrentUser();
  const supabase = await createClient();
  const company = await loadCompany(supabase, companyId);
  if (!company) return fail("기업을 찾을 수 없습니다.");

  const { data: comp } = await supabase
    .from("dd_assessments")
    .select("verdict")
    .eq("company_id", companyId)
    .eq("stage", "completeness")
    .maybeSingle();
  if (!comp) return fail("먼저 서류 분류·완결성 판정을 실행해 주세요.");
  if (comp.verdict === "fail")
    return fail("필수 서류가 미비합니다. 보완 후 다시 실행해 주세요.");

  const { risk } = await loadCriteria(supabase, company.batch_id);
  if (risk.length === 0) return fail("리스크 기준이 비어 있습니다.");

  const { data: fileRows } = await supabase
    .from("dd_files")
    .select(
      "id, storage_path, file_name, mime_type, criterion_code, override_code, readable",
    )
    .eq("company_id", companyId)
    .order("uploaded_at");

  // 체크리스트에 붙은 파일만 넣는다. 미분류 파일은 무엇인지 모르는 채로 토큰만
  // 먹고, 모델이 그 내용을 엉뚱한 기준의 근거로 쓸 위험이 있다.
  const { doc } = await loadCriteria(supabase, company.batch_id);
  const labelByCode = new Map(doc.map((d) => [d.code, d.label]));

  const docs: RiskInputDoc[] = [];
  for (const f of fileRows ?? []) {
    if (!f.readable) continue;
    const code = (f.override_code as string | null) ?? (f.criterion_code as string | null);
    if (!code) continue;
    const { data: blob } = await supabase.storage
      .from(BUCKET)
      .download(f.storage_path as string);
    if (!blob) continue;
    docs.push({
      label: labelByCode.get(code) ?? code,
      fileName: f.file_name as string,
      bytes: new Uint8Array(await blob.arrayBuffer()),
      mimeType: (f.mime_type as string) ?? "",
    });
  }

  // 기업이 "해당 없음"이라고 적어 낸 항목도 판정에 넣는다. 안 넣으면 모델이
  // 그 기준을 그냥 'unknown' 으로 두고, 회사가 뭐라고 주장했는지가 투심 자료에서
  // 사라진다. 자기확약이라는 표시는 반드시 붙인다 — RISK_SYSTEM 의 가드가
  // 이걸 보고 level='none' 으로 올리지 않는다.
  const declarations = await loadDeclarations(supabase, companyId);
  const declared = declarations.filter(
    (d) => d.kind === "none_applicable" && d.reason,
  );

  if (docs.length === 0 && declared.length === 0)
    return fail("판정에 넣을 분류된 문서가 없습니다.");

  try {
    const { data, skipped } = await assessRisk({
      companyName: company.name,
      docs,
      criteria: risk,
      declarations: declared.map((d) => ({
        label: labelByCode.get(d.criterionCode) ?? d.criterionCode,
        reason: d.reason,
      })),
    });

    const { error } = await supabase.from("dd_assessments").upsert(
      {
        company_id: companyId,
        stage: "risk",
        verdict: data.verdict,
        summary: data.summary,
        details: { items: data.items, followUps: data.followUps, skipped },
        model: "claude-opus-5",
        created_at: new Date().toISOString(),
        created_by: me?.id ?? null,
      },
      { onConflict: "company_id,stage" },
    );
    if (error) return fail(error.message);

    touch();
    return { ok: true, data: { skipped } };
  } catch (e) {
    return fail(e instanceof Error ? e.message : String(e));
  }
}

// =============================================================================
// 사람 결정
// =============================================================================

/** AI 판정을 덮는 최종값. reason 은 뒤집을 때 특히 중요하다(투심 설명용). */
export async function setDecision(
  companyId: string,
  verdict: Verdict,
  reason: string,
): Promise<ActionResult> {
  const me = await getCurrentUser();
  if (!me) return fail("로그인이 필요합니다.");

  const supabase = await createClient();
  const { error } = await supabase.from("dd_decisions").upsert(
    {
      company_id: companyId,
      verdict,
      reason: reason.trim(),
      updated_at: new Date().toISOString(),
      updated_by: me.id,
    },
    { onConflict: "company_id" },
  );
  if (error) return fail(error.message);
  touch();
  return { ok: true };
}

export async function clearDecision(companyId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("dd_decisions")
    .delete()
    .eq("company_id", companyId);
  if (error) return fail(error.message);
  touch();
  return { ok: true };
}

// =============================================================================
// 기준 편집
// =============================================================================

export async function updateCriterion(
  id: string,
  patch: {
    label?: string;
    guidance?: string;
    required?: boolean;
    maxAgeDays?: number;
  },
): Promise<ActionResult> {
  const supabase = await createClient();
  const row: Record<string, unknown> = {};
  if (patch.label !== undefined) {
    const v = patch.label.trim();
    if (!v) return fail("항목명을 비울 수 없습니다.");
    row.label = v;
  }
  if (patch.guidance !== undefined) row.guidance = patch.guidance.trim();
  if (patch.required !== undefined) row.required = patch.required;
  if (patch.maxAgeDays !== undefined) {
    if (!Number.isInteger(patch.maxAgeDays) || patch.maxAgeDays < 0)
      return fail("신선도 일수는 0 이상의 정수여야 합니다.");
    row.max_age_days = patch.maxAgeDays;
  }
  if (Object.keys(row).length === 0) return { ok: true };

  const { error } = await supabase.from("dd_criteria").update(row).eq("id", id);
  if (error) return fail(error.message);
  touch();
  return { ok: true };
}

export async function addCriterion(args: {
  batchId: string;
  kind: "doc" | "risk";
  label: string;
  guidance: string;
  required: boolean;
  maxAgeDays: number;
}): Promise<ActionResult> {
  const label = args.label.trim();
  if (!label) return fail("항목명을 입력해 주세요.");

  const supabase = await createClient();
  const { data: existing } = await supabase
    .from("dd_criteria")
    .select("code, sort_order")
    .eq("batch_id", args.batchId)
    .eq("kind", args.kind);

  // 코드는 사람이 보지 않는 내부 키라 충돌만 피하면 된다.
  const used = new Set((existing ?? []).map((c) => c.code as string));
  let code = `custom_${used.size + 1}`;
  let n = used.size + 1;
  while (used.has(code)) code = `custom_${++n}`;
  const nextOrder =
    Math.max(0, ...(existing ?? []).map((c) => Number(c.sort_order ?? 0))) + 1;

  const { error } = await supabase.from("dd_criteria").insert({
    batch_id: args.batchId,
    kind: args.kind,
    code,
    label,
    guidance: args.guidance.trim(),
    required: args.required,
    max_age_days: args.kind === "doc" ? args.maxAgeDays : 0,
    sort_order: nextOrder,
  });
  if (error) return fail(error.message);
  touch();
  return { ok: true };
}

/**
 * 기준 삭제. 이 항목으로 분류된 파일은 건드리지 않는다 — dd_files 는 코드를
 * text 로 들고 있어(마이그레이션 §4) 항목을 되살리면 분류가 그대로 붙는다.
 */
export async function deleteCriterion(id: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.from("dd_criteria").delete().eq("id", id);
  if (error) return fail(error.message);
  touch();
  return { ok: true };
}
