// 서류실사 데이터 로드. 전부 Supabase 안에서 끝난다(slab/Bubble 조회 없음) —
// 배치 지원 기업은 아직 우리 포트폴리오가 아니라 slab 에 레코드가 없다.

import { createClient } from "@/lib/supabase/server";

import type {
  CompletenessDetails,
  DdAssessment,
  DdBatch,
  DdBatchData,
  DdCompany,
  DdCriterion,
  DdFile,
  RiskDetails,
  Verdict,
} from "./types";

type CriterionRow = {
  id: string;
  kind: string;
  code: string;
  label: string;
  guidance: string;
  required: boolean;
  max_age_days: number;
  sort_order: number;
};

function toCriterion(r: CriterionRow): DdCriterion {
  return {
    id: r.id,
    kind: r.kind === "risk" ? "risk" : "doc",
    code: r.code,
    label: r.label,
    guidance: r.guidance,
    required: r.required,
    maxAgeDays: r.max_age_days,
    sortOrder: r.sort_order,
  };
}

/** 배치 목록(기업 수 포함). 사이드 목록·배치 선택에 쓴다. */
export async function listBatches(): Promise<DdBatch[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("dd_batches")
    .select("id, name, note, created_at, dd_companies(count)")
    .order("created_at", { ascending: false });

  return (data ?? []).map((b) => {
    // PostgREST 의 count 임베드는 [{count:n}] 형태로 온다.
    const raw = b.dd_companies as unknown;
    const count = Array.isArray(raw) ? ((raw[0] as { count?: number })?.count ?? 0) : 0;
    return {
      id: b.id as string,
      name: b.name as string,
      note: (b.note as string) ?? "",
      createdAt: b.created_at as string,
      companyCount: count,
    };
  });
}

/** 배치 하나의 전체 상태 — 기준 · 기업 · 파일 · 판정 · 사람 결정. */
export async function loadBatch(batchId: string): Promise<DdBatchData | null> {
  const supabase = await createClient();

  const { data: batchRow } = await supabase
    .from("dd_batches")
    .select("id, name, note, created_at")
    .eq("id", batchId)
    .maybeSingle();
  if (!batchRow) return null;

  const [{ data: critRows }, { data: companyRows }] = await Promise.all([
    supabase
      .from("dd_criteria")
      .select("id, kind, code, label, guidance, required, max_age_days, sort_order")
      .eq("batch_id", batchId)
      .order("sort_order"),
    supabase
      .from("dd_companies")
      .select("id, name, note")
      .eq("batch_id", batchId)
      .order("name"),
  ]);

  const companyIds = (companyRows ?? []).map((c) => c.id as string);

  // 기업이 없으면 in() 에 빈 배열이 들어가 PostgREST 가 전건을 긁을 수 있으므로
  // 아예 조회하지 않는다.
  const [filesRes, assessRes, decisionRes] =
    companyIds.length === 0
      ? [{ data: [] }, { data: [] }, { data: [] }]
      : await Promise.all([
          supabase
            .from("dd_files")
            .select(
              "id, company_id, storage_path, file_name, mime_type, byte_size, criterion_code, doc_title, issued_date, as_of_date, doc_company, confidence, readable, classify_note, classified_at, override_code, uploaded_at",
            )
            .in("company_id", companyIds)
            .order("uploaded_at"),
          supabase
            .from("dd_assessments")
            .select("company_id, stage, verdict, summary, details, model, created_at")
            .in("company_id", companyIds),
          supabase
            .from("dd_decisions")
            .select(
              "company_id, verdict, reason, updated_at, updater:updated_by (name, email)",
            )
            .in("company_id", companyIds),
        ]);

  const filesByCompany = new Map<string, DdFile[]>();
  for (const f of (filesRes.data ?? []) as Record<string, unknown>[]) {
    const cid = f.company_id as string;
    const conf = (f.confidence as string) ?? "";
    const file: DdFile = {
      id: f.id as string,
      storagePath: f.storage_path as string,
      fileName: f.file_name as string,
      mimeType: (f.mime_type as string) ?? "",
      byteSize: Number(f.byte_size ?? 0),
      criterionCode: (f.criterion_code as string | null) ?? null,
      docTitle: (f.doc_title as string) ?? "",
      issuedDate: (f.issued_date as string | null) ?? null,
      asOfDate: (f.as_of_date as string | null) ?? null,
      docCompany: (f.doc_company as string) ?? "",
      confidence: (["high", "medium", "low"].includes(conf) ? conf : "") as DdFile["confidence"],
      readable: Boolean(f.readable),
      classifyNote: (f.classify_note as string) ?? "",
      classifiedAt: (f.classified_at as string | null) ?? null,
      overrideCode: (f.override_code as string | null) ?? null,
      uploadedAt: f.uploaded_at as string,
    };
    const list = filesByCompany.get(cid);
    if (list) list.push(file);
    else filesByCompany.set(cid, [file]);
  }

  const assessByCompany = new Map<string, DdAssessment[]>();
  for (const a of (assessRes.data ?? []) as Record<string, unknown>[]) {
    const cid = a.company_id as string;
    const item: DdAssessment = {
      stage: a.stage === "risk" ? "risk" : "completeness",
      verdict: a.verdict as Verdict,
      summary: (a.summary as string) ?? "",
      details: (a.details ?? {}) as CompletenessDetails | RiskDetails,
      model: (a.model as string) ?? "",
      createdAt: a.created_at as string,
    };
    const list = assessByCompany.get(cid);
    if (list) list.push(item);
    else assessByCompany.set(cid, [item]);
  }

  const decisionByCompany = new Map<string, DdCompany["decision"]>();
  for (const d of (decisionRes.data ?? []) as Record<string, unknown>[]) {
    const raw = d.updater as
      | { name: string | null; email: string | null }
      | { name: string | null; email: string | null }[]
      | null;
    const u = Array.isArray(raw) ? (raw[0] ?? null) : raw;
    decisionByCompany.set(d.company_id as string, {
      verdict: d.verdict as Verdict,
      reason: (d.reason as string) ?? "",
      updatedAt: d.updated_at as string,
      updatedByName: u?.name?.trim() || u?.email || "알 수 없음",
    });
  }

  const companies: DdCompany[] = (companyRows ?? []).map((c) => {
    const id = c.id as string;
    const assessments = assessByCompany.get(id) ?? [];
    const completeness = assessments.find((a) => a.stage === "completeness") ?? null;
    const risk = assessments.find((a) => a.stage === "risk") ?? null;
    return {
      id,
      name: c.name as string,
      note: (c.note as string) ?? "",
      files: filesByCompany.get(id) ?? [],
      completeness: completeness as DdCompany["completeness"],
      risk: risk as DdCompany["risk"],
      decision: decisionByCompany.get(id) ?? null,
    };
  });

  const criteria = ((critRows ?? []) as CriterionRow[]).map(toCriterion);

  return {
    batch: {
      id: batchRow.id as string,
      name: batchRow.name as string,
      note: (batchRow.note as string) ?? "",
      createdAt: batchRow.created_at as string,
      companyCount: companies.length,
    },
    docCriteria: criteria.filter((c) => c.kind === "doc"),
    riskCriteria: criteria.filter((c) => c.kind === "risk"),
    companies,
  };
}
