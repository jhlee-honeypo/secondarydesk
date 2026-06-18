"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/supabase/auth";
import {
  extractFromFile,
  isSupportedFile,
  type ExtractedFinancials,
} from "@/lib/claude-extract";
import { getSlabFinancialReports, fetchSlabFile } from "@/lib/bubble";

// 검토 표에 띄우는 추출 행(저장 전). 사용자가 수정 후 saveFinancials 로 확정.
export type ReviewRow = {
  key: string; // 클라 식별용
  company_name: string;
  company_name_en: string | null;
  bubble_company_id: string | null;
  report_year: number;
  report_month: number; // 3/6/9/12
  rev_curr: number;
  ni_curr: number;
  rev_prev: number;
  ni_prev: number;
  cash: number;
  savings: number;
  total_equity: number;
  capital: number;
  sga: number;
  source: "upload" | "slab";
  source_file: string | null;
  source_file_url: string | null;
  source_file_urls: string[]; // 원본 PDF 링크(들) — slab CDN URL 또는 업로드 object URL
  // 참고(저장 안 함): slab 기입 지표·정성 정보
  slab_cash: number | null;
  slab_runway: number | null;
  slab_funding: string | null; // 투자유치여부
  slab_funding_series: string | null; // 라운드 시리즈
  slab_total_raised: number | null; // 누적 조달액
  slab_highlight: string | null; // 비즈니스 하이라이트(사업/개발/영업 현황)
  slab_head_count: number | null; // 직원 수
};

export type SlabReportItem = {
  key: string; // `${companyId}|${year}|${month}`
  companyId: string;
  nameKr: string;
  nameEn: string | null;
  fundNames: string[];
  year: number;
  month: number;
  quarter: string;
  hasFile: boolean; // false = 미제출(선택 불가)
  fileName: string;
  alreadySaved: boolean;
};

export type ExtractResult = { rows: ReviewRow[]; errors: string[] };

function toRow(
  d: ExtractedFinancials,
  base: Partial<ReviewRow> & Pick<ReviewRow, "key" | "source">,
): ReviewRow {
  return {
    key: base.key,
    company_name:
      base.company_name ??
      (d.companyName.toLowerCase() === "unknown" ? "" : d.companyName),
    company_name_en: base.company_name_en ?? null,
    bubble_company_id: base.bubble_company_id ?? null,
    report_year: base.report_year ?? new Date().getFullYear(),
    report_month: base.report_month ?? d.month,
    rev_curr: d.revCurr,
    ni_curr: d.niCurr,
    rev_prev: d.revPrev,
    ni_prev: d.niPrev,
    cash: d.cash,
    savings: d.savings,
    total_equity: d.totalEquity,
    capital: d.capital,
    sga: d.sga,
    source: base.source,
    source_file: base.source_file ?? null,
    source_file_url: base.source_file_url ?? null,
    source_file_urls: base.source_file_urls ?? [],
    slab_cash: base.slab_cash ?? null,
    slab_runway: base.slab_runway ?? null,
    slab_funding: base.slab_funding ?? null,
    slab_funding_series: base.slab_funding_series ?? null,
    slab_total_raised: base.slab_total_raised ?? null,
    slab_highlight: base.slab_highlight ?? null,
    slab_head_count: base.slab_head_count ?? null,
  };
}

function pickNonZero(a: number, b: number): number {
  return a === 0 && b !== 0 ? b : a;
}

function safeDecode(u: string): string {
  try {
    return decodeURIComponent(u);
  } catch {
    return u;
  }
}

// 한 분기에 여러 파일(재무상태표/손익계산서 분리 제출)을 각각 추출한 결과를
// 한 건으로 병합(0이 아닌 값 우선). 회사명·보고월은 비어있지 않은 첫 값.
function mergeExtracted(list: ExtractedFinancials[]): ExtractedFinancials {
  if (list.length <= 1) return list[0];
  const pick = (sel: (d: ExtractedFinancials) => number) =>
    list.reduce((acc, d) => pickNonZero(acc, sel(d)), 0);
  return {
    companyName:
      list.map((d) => d.companyName).find((n) => n && n.toLowerCase() !== "unknown") ??
      list[0].companyName,
    revCurr: pick((d) => d.revCurr),
    niCurr: pick((d) => d.niCurr),
    revPrev: pick((d) => d.revPrev),
    niPrev: pick((d) => d.niPrev),
    cash: pick((d) => d.cash),
    savings: pick((d) => d.savings),
    totalEquity: pick((d) => d.totalEquity),
    capital: pick((d) => d.capital),
    month: list.map((d) => d.month).find((m) => m > 0) ?? 0,
    sga: pick((d) => d.sga),
  };
}

// 같은 회사(같은 분기)의 재무상태표/손익계산서 두 건을 한 행으로 병합.
function mergeRows(rows: ReviewRow[]): ReviewRow[] {
  const byKey = new Map<string, ReviewRow>();
  for (const r of rows) {
    const name = r.company_name.trim().toLowerCase();
    const k = name ? `${name}|${r.report_year}|${r.report_month}` : r.key;
    const prev = byKey.get(k);
    if (!prev || !name) {
      byKey.set(k, prev ? prev : r);
      if (!name) byKey.set(r.key, r); // unknown 은 병합하지 않음
      continue;
    }
    byKey.set(k, {
      ...prev,
      rev_curr: pickNonZero(prev.rev_curr, r.rev_curr),
      ni_curr: pickNonZero(prev.ni_curr, r.ni_curr),
      rev_prev: pickNonZero(prev.rev_prev, r.rev_prev),
      ni_prev: pickNonZero(prev.ni_prev, r.ni_prev),
      cash: pickNonZero(prev.cash, r.cash),
      savings: pickNonZero(prev.savings, r.savings),
      total_equity: pickNonZero(prev.total_equity, r.total_equity),
      capital: pickNonZero(prev.capital, r.capital),
      sga: pickNonZero(prev.sga, r.sga),
    });
  }
  return [...byKey.values()];
}

/** slab 재무제표 목록(이미 저장된 분기 표시 + 조합명 DB 변환). */
export async function listSlabReports(): Promise<SlabReportItem[]> {
  const [reports, supabase] = await Promise.all([
    getSlabFinancialReports(),
    createClient(),
  ]);

  const [{ data: savedRows }, { data: fundRows }] = await Promise.all([
    supabase
      .from("financial_statements")
      .select("bubble_company_id, report_year, report_month"),
    // slab fund 타입이 비어있어, 조합명은 우리 운용펀드(holding_funds)의 ERP 연결키로 변환
    supabase.from("holding_funds").select("name, short_name, bubble_id"),
  ]);

  const saved = new Set(
    (savedRows ?? []).map(
      (r) => `${r.bubble_company_id}|${r.report_year}|${r.report_month}`,
    ),
  );
  const fundNameByBubbleId = new Map<string, string>();
  for (const f of fundRows ?? []) {
    // 약칭 우선(목록이 길어지지 않게), 없으면 전체명
    const label = ((f.short_name as string | null)?.trim() || (f.name as string)) ?? "";
    if (f.bubble_id) fundNameByBubbleId.set(f.bubble_id as string, label);
  }

  return reports.map((r) => ({
    key: r.key,
    companyId: r.companyId,
    nameKr: r.nameKr,
    nameEn: r.nameEn,
    fundNames: r.fundIds
      .map((id) => fundNameByBubbleId.get(id))
      .filter((n): n is string => Boolean(n)),
    year: r.year,
    month: r.month,
    quarter: r.quarter,
    hasFile: r.hasFile,
    fileName: r.fileName,
    alreadySaved: saved.has(`${r.companyId}|${r.year}|${r.month}`),
  }));
}

/** slab 분기 보고 일괄 추출(클라가 소량 배치로 반복 호출). keys = SlabReportItem.key */
export async function extractSlabBatch(keys: string[]): Promise<ExtractResult> {
  const reports = await getSlabFinancialReports();
  const byKey = new Map(reports.map((r) => [r.key, r]));
  const rows: ReviewRow[] = [];
  const errors: string[] = [];

  for (const k of keys) {
    const rep = byKey.get(k);
    if (!rep) {
      errors.push(`${k}: slab 보고서 없음`);
      continue;
    }
    if (!rep.hasFile || rep.fileUrls.length === 0) {
      errors.push(`${rep.nameKr}: 재무제표 미제출(파일 없음)`);
      continue;
    }

    // 연결 우선: 파일명에 '연결'(consolidated)이 있으면 그 파일만 추출(별도 PDF 무시).
    // 없으면 전체 파일(분리 제출된 BS/IS 등) 추출 후 병합.
    const consolidated = rep.fileUrls.filter((u) => /연결|consolidat/i.test(safeDecode(u)));
    const orderedUrls = consolidated.length
      ? [...consolidated, ...rep.fileUrls.filter((u) => !consolidated.includes(u))]
      : rep.fileUrls;
    const extractUrls = consolidated.length ? consolidated : rep.fileUrls;

    // 파일별로 추출(하나 실패해도 회사 전체를 죽이지 않음).
    const extracted: ExtractedFinancials[] = [];
    for (const url of extractUrls) {
      try {
        const { bytes, mediaType, fileName } = await fetchSlabFile(url);
        extracted.push(await extractFromFile(bytes, mediaType, fileName));
      } catch (e) {
        errors.push(
          `${rep.nameKr} (${safeDecode(url).split("/").pop()}): ${e instanceof Error ? e.message : String(e)}`,
        );
      }
    }
    if (extracted.length === 0) continue; // 모든 파일 실패 → 위 오류만 남김

    const d = mergeExtracted(extracted);
    rows.push(
      toRow(d, {
        key: `slab-${rep.key}`,
        source: "slab",
        company_name: rep.nameKr,
        company_name_en: rep.nameEn,
        bubble_company_id: rep.companyId,
        report_year: rep.year,
        report_month: rep.month || d.month,
        source_file: rep.fileName,
        source_file_url: orderedUrls[0],
        source_file_urls: orderedUrls,
        slab_cash: rep.currentCash,
        slab_runway: rep.runway,
        slab_funding: rep.newFundingRound,
        slab_funding_series: rep.fundingSeries,
        slab_total_raised: rep.totalRaised,
        slab_highlight: rep.businessHighlight,
        slab_head_count: rep.headCount,
      }),
    );
  }
  return { rows, errors };
}

/** 업로드한 파일 일괄 추출(BS/IS 병합). */
export async function extractUploads(formData: FormData): Promise<ExtractResult> {
  const files = formData.getAll("files").filter((f): f is File => f instanceof File);
  const rows: ReviewRow[] = [];
  const errors: string[] = [];

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const mediaType = file.type || "";
    if (!isSupportedFile(mediaType, file.name)) {
      errors.push(`${file.name}: 지원하지 않는 형식 (PDF·이미지·엑셀만 가능)`);
      continue;
    }
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const d = await extractFromFile(bytes, mediaType, file.name);
      rows.push(
        toRow(d, {
          key: `upload-${i}-${file.name}`,
          source: "upload",
          source_file: file.name,
        }),
      );
    } catch (e) {
      errors.push(`${file.name}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return { rows: mergeRows(rows), errors };
}

export type SaveResult = { ok: true; saved: number; skipped: number } | { ok: false; error: string };

/** 검토 완료 행을 DB 에 upsert(회사·연도·분기 단위). */
export async function saveFinancials(rows: ReviewRow[]): Promise<SaveResult> {
  const me = await getCurrentUser();
  if (!me) return { ok: false, error: "로그인이 필요합니다." };

  const valid = rows.filter(
    (r) =>
      r.company_name.trim() &&
      r.company_name.trim().toLowerCase() !== "unknown" &&
      r.report_year > 0 &&
      r.report_month > 0,
  );
  const skipped = rows.length - valid.length;
  if (valid.length === 0) return { ok: false, error: "저장할 유효한 행이 없습니다(회사명·연도·분기 확인)." };

  const supabase = await createClient();
  const payload = valid.map((r) => ({
    company_name: r.company_name.trim(),
    company_name_en: r.company_name_en,
    bubble_company_id: r.bubble_company_id,
    report_year: r.report_year,
    report_month: r.report_month,
    rev_curr: r.rev_curr,
    ni_curr: r.ni_curr,
    rev_prev: r.rev_prev,
    ni_prev: r.ni_prev,
    cash: r.cash,
    savings: r.savings,
    total_equity: r.total_equity,
    capital: r.capital,
    sga: r.sga,
    source: r.source,
    source_file: r.source_file,
    // 영구 보기 가능한 http(s) URL 만 저장(여러 개면 줄바꿈). blob: 등 임시 URL 제외.
    source_file_url:
      r.source_file_urls.filter((u) => /^https?:/i.test(u)).join("\n") ||
      r.source_file_url,
    funding_round: r.slab_funding,
    funding_series: r.slab_funding_series,
    total_raised: r.slab_total_raised,
    business_highlight: r.slab_highlight,
    head_count: r.slab_head_count,
    created_by: me.id,
  }));

  const { error } = await supabase
    .from("financial_statements")
    .upsert(payload, { onConflict: "company_name,report_year,report_month" });
  if (error) return { ok: false, error: error.message };

  revalidatePath("/financials");
  return { ok: true, saved: valid.length, skipped };
}

export async function deleteFinancial(id: string): Promise<SaveResult> {
  const supabase = await createClient();
  const { error } = await supabase.from("financial_statements").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/financials");
  return { ok: true, saved: 0, skipped: 0 };
}
