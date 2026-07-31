// slab 분기보고에 새로 올라온 재무제표를 추출해 financial_statements 에 적재한다.
//
// 왜 별도 모듈인가: 크론은 세션 쿠키가 없어 쿠키 기반 createClient 로는 RLS 에 막힌다.
// erp-sync.ts 와 같은 패턴으로, Supabase 클라이언트를 인자로 받는 plain 모듈로 두고
// 크론은 service-role, (필요하면) 화면은 세션 클라이언트를 넘긴다.
//
// ⚠️ 이 경로는 사람의 검토를 거치지 않는다. /financials 화면의 수동 흐름은
// '추출 → 검토·수정 → 저장'이지만 여기서는 추출값이 그대로 저장되므로,
// 추출 오류가 건전성 등급에 바로 반영된다. 사용자가 이 절충을 알고 선택했다.
import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  fetchSlabFile,
  getSlabFinancialReports,
  type SlabFinancialReport,
} from "@/lib/bubble";
import { extractFromFile, type ExtractedFinancials } from "@/lib/claude-extract";

/** 한 번의 실행에서 새 추출을 시작하지 않는 시각(ms). 라우트 maxDuration 300s 안에서
 *  이미 진행 중인 건이 끝날 여유를 남긴다. */
const START_DEADLINE_MS = 230_000;

/** 동시 추출 수. Claude 호출이라 너무 올리면 레이트리밋에 걸린다. */
const CONCURRENCY = 3;

/** 한 번에 처리할 최대 건수(폭주 방지 상한). 남으면 다음 실행에서 이어진다. */
const MAX_PER_RUN = 60;

export function pickNonZero(a: number, b: number): number {
  return a === 0 && b !== 0 ? b : a;
}

export function safeDecode(u: string): string {
  try {
    return decodeURIComponent(u);
  } catch {
    return u;
  }
}

// 한 분기에 여러 파일(재무상태표/손익계산서 분리 제출)을 각각 추출한 결과를
// 한 건으로 병합(0이 아닌 값 우선). 회사명·보고월은 비어있지 않은 첫 값.
export function mergeExtracted(list: ExtractedFinancials[]): ExtractedFinancials {
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
    cogs: pick((d) => d.cogs),
    operatingIncome: pick((d) => d.operatingIncome),
    currentAssets: pick((d) => d.currentAssets),
    currentLiabilities: pick((d) => d.currentLiabilities),
    totalAssets: pick((d) => d.totalAssets),
    totalLiabilities: pick((d) => d.totalLiabilities),
    retainedEarnings: pick((d) => d.retainedEarnings),
  };
}

/**
 * 아직 적재되지 않은 '새 분기'를 고른다.
 *
 * 의도적으로 과거 미추출분은 건드리지 않는다 — slab 에는 파일 붙은 분기보고가 570건이 넘고,
 * 저장본은 그중 일부다. 전량 소급 추출하면 비용이 폭증하고, 이 크론의 목적은
 * '따라가기'이지 '소급'이 아니다. 과거분은 /financials 화면에서 필요할 때 수동으로.
 *
 * 규칙:
 *   - 저장 이력이 있는 회사 → 저장된 최신 분기보다 뒤인 분기만
 *   - 저장 이력이 없는 회사 → 파일 있는 '가장 최신' 분기 1건만
 */
export async function findPendingReports(
  supabase: SupabaseClient,
): Promise<SlabFinancialReport[]> {
  const [reports, savedRes] = await Promise.all([
    getSlabFinancialReports(),
    supabase
      .from("financial_statements")
      .select("bubble_company_id, report_year, report_month"),
  ]);

  const ord = (y: number, m: number) => y * 100 + m;

  // 회사별 저장된 최신 분기. bubble_company_id 로 맞춘다(회사명 표기 흔들림에 안전).
  const savedMax = new Map<string, number>();
  const savedKeys = new Set<string>();
  for (const r of savedRes.data ?? []) {
    const cid = r.bubble_company_id as string | null;
    if (!cid) continue;
    const o = ord((r.report_year as number) ?? 0, (r.report_month as number) ?? 0);
    savedKeys.add(`${cid}|${r.report_year}|${r.report_month}`);
    if (!savedMax.has(cid) || o > (savedMax.get(cid) as number)) savedMax.set(cid, o);
  }

  // 회사별 파일 있는 최신 분기(저장 이력 없는 회사용).
  const latestByCompany = new Map<string, number>();
  for (const r of reports) {
    if (!r.hasFile) continue;
    const o = ord(r.year, r.month);
    if (!latestByCompany.has(r.companyId) || o > (latestByCompany.get(r.companyId) as number)) {
      latestByCompany.set(r.companyId, o);
    }
  }

  const pending = reports.filter((r) => {
    if (!r.hasFile) return false;
    if (savedKeys.has(`${r.companyId}|${r.year}|${r.month}`)) return false;
    const o = ord(r.year, r.month);
    const max = savedMax.get(r.companyId);
    if (max == null) return o === latestByCompany.get(r.companyId); // 이력 없음 → 최신 1건
    return o > max;
  });

  // 최신 분기부터 처리 — 실행이 중간에 잘려도 더 중요한 것이 먼저 들어간다.
  return pending.sort((a, b) => ord(b.year, b.month) - ord(a.year, a.month));
}

/** 보고 1건 추출. 파일이 여러 개면 '연결' 파일 우선, 없으면 전부 추출 후 병합. */
async function extractReport(
  rep: SlabFinancialReport,
): Promise<{ data: ExtractedFinancials; urls: string[] } | { error: string }> {
  const consolidated = rep.fileUrls.filter((u) => /연결|consolidat/i.test(safeDecode(u)));
  const orderedUrls = consolidated.length
    ? [...consolidated, ...rep.fileUrls.filter((u) => !consolidated.includes(u))]
    : rep.fileUrls;
  const extractUrls = consolidated.length ? consolidated : rep.fileUrls;

  const extracted: ExtractedFinancials[] = [];
  const failures: string[] = [];
  for (const url of extractUrls) {
    try {
      const { bytes, mediaType, fileName } = await fetchSlabFile(url);
      extracted.push(await extractFromFile(bytes, mediaType, fileName));
    } catch (e) {
      failures.push(e instanceof Error ? e.message : String(e));
    }
  }
  if (extracted.length === 0) {
    return { error: `${rep.nameKr} ${rep.year}-${rep.month}: ${failures.join(" / ") || "추출 실패"}` };
  }
  return { data: mergeExtracted(extracted), urls: orderedUrls };
}

function toDbRow(d: ExtractedFinancials, rep: SlabFinancialReport) {
  return {
    company_name: rep.nameKr.trim(),
    company_name_en: rep.nameEn,
    bubble_company_id: rep.companyId,
    report_year: rep.year,
    report_month: rep.month || d.month,
    rev_curr: d.revCurr,
    ni_curr: d.niCurr,
    rev_prev: d.revPrev,
    ni_prev: d.niPrev,
    cash: d.cash,
    savings: d.savings,
    total_equity: d.totalEquity,
    capital: d.capital,
    sga: d.sga,
    cogs: d.cogs,
    operating_income: d.operatingIncome,
    current_assets: d.currentAssets,
    current_liabilities: d.currentLiabilities,
    total_assets: d.totalAssets,
    total_liabilities: d.totalLiabilities,
    retained_earnings: d.retainedEarnings,
    source: "slab" as const,
    source_file: rep.fileName,
    source_file_url: rep.fileUrls.filter((u) => /^https?:/i.test(u)).join("\n"),
    funding_round: rep.newFundingRound,
    funding_series: rep.fundingSeries,
    total_raised: rep.totalRaised,
    business_highlight: rep.businessHighlight,
    head_count: rep.headCount,
    // 크론은 사용자가 없다. created_by 는 nullable 이라 비워 둔다(source='slab' 로 구분).
    created_by: null,
  };
}

export type FinancialSyncResult = {
  ok: boolean;
  pending: number; // 이번 실행 시작 시점의 미반영 건수
  attempted: number;
  saved: number;
  failed: number;
  remaining: number; // 시간·상한에 걸려 다음 실행으로 넘긴 건수
  errors: string[];
  elapsedMs: number;
};

/**
 * 미반영 분기를 추출해 적재한다. 시간 예산(START_DEADLINE_MS)과 상한(MAX_PER_RUN)에
 * 걸리면 남은 건은 다음 실행으로 넘긴다 — 남은 수는 remaining 으로 돌려준다.
 */
export async function runFinancialSync(
  supabase: SupabaseClient,
  // 상한 축소용(운영·점검). 미지정이면 MAX_PER_RUN.
  limit?: number,
): Promise<FinancialSyncResult> {
  const startedAt = Date.now();
  const errors: string[] = [];

  let pendingAll: SlabFinancialReport[];
  try {
    pendingAll = await findPendingReports(supabase);
  } catch (e) {
    return {
      ok: false,
      pending: 0,
      attempted: 0,
      saved: 0,
      failed: 0,
      remaining: 0,
      errors: [e instanceof Error ? e.message : String(e)],
      elapsedMs: Date.now() - startedAt,
    };
  }

  const cap = Math.max(1, Math.min(limit ?? MAX_PER_RUN, MAX_PER_RUN));
  const queue = pendingAll.slice(0, cap);
  let cursor = 0;
  let attempted = 0;
  let saved = 0;
  let failed = 0;

  // 워커 N개가 같은 큐를 나눠 먹는다. 앞선 건이 느려도 뒤가 밀리지 않는다.
  async function worker() {
    for (;;) {
      if (Date.now() - startedAt > START_DEADLINE_MS) return;
      const i = cursor++;
      if (i >= queue.length) return;
      const rep = queue[i];
      attempted++;

      const res = await extractReport(rep);
      if ("error" in res) {
        failed++;
        errors.push(res.error);
        continue;
      }

      const { error } = await supabase
        .from("financial_statements")
        .upsert(toDbRow(res.data, rep), {
          onConflict: "company_name,report_year,report_month",
        });
      if (error) {
        failed++;
        errors.push(`${rep.nameKr} ${rep.year}-${rep.month}: ${error.message}`);
      } else {
        saved++;
      }
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  if (saved > 0) {
    revalidatePath("/financials");
    revalidatePath("/financial-status");
  }

  return {
    ok: true,
    pending: pendingAll.length,
    attempted,
    saved,
    failed,
    remaining: pendingAll.length - saved,
    // 오류가 많아도 응답이 비대해지지 않게 앞부분만.
    errors: errors.slice(0, 20),
    elapsedMs: Date.now() - startedAt,
  };
}
