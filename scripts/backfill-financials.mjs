// 일회성 백필: slab 분기보고에 첨부된 재무제표(PDF/이미지/엑셀)를 Claude 로 추출해
// Supabase `financial_statements` 에 upsert 한다. slab-bot 이 이 표를 service-role 로
// 읽어 감사 실적·건전성·자본잠식 질문에 답하게 하는 것이 목적(Phase 1).
//
// 기본은 회사별 '최신 재무제표 분기' 1건(가성비·현재 상태). --all-quarters 로 전체
// 분기(시계열)를 다 추출한다. Node 24 가 아래 .ts 라이브러리를 타입 스트리핑으로 로드한다.
//
// 사전조건:
//   1) supabase/migrations/20260726000000_financial_statements_expand.sql 이 DB 에 적용됨(7컬럼)
//   2) .env.local 에 ANTHROPIC_API_KEY, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
//
// 사용:
//   node --env-file=.env.local scripts/backfill-financials.mjs --dry-run     (대상만 나열·무료)
//   node --env-file=.env.local scripts/backfill-financials.mjs --limit 3     (앞 3건 — 소액 테스트)
//   node --env-file=.env.local scripts/backfill-financials.mjs               (회사별 최신 분기 전량)
//   node --env-file=.env.local scripts/backfill-financials.mjs --all-quarters(전체 분기 시계열)
//   node --env-file=.env.local scripts/backfill-financials.mjs --skip-existing(이미 저장된 분기 제외·재실행)

import { createClient } from "@supabase/supabase-js";
import { getSlabFinancialReports, fetchSlabFile } from "../src/lib/bubble.ts";
import { extractFromFile, isSupportedFile } from "../src/lib/claude-extract.ts";
import { isBalanceConsistent } from "../src/lib/financial-health.ts";

const DRY = process.argv.includes("--dry-run");
const SKIP_EXISTING = process.argv.includes("--skip-existing");
const ALL_QUARTERS = process.argv.includes("--all-quarters");
const limitArg = process.argv.indexOf("--limit");
const LIMIT =
  limitArg >= 0 ? Number(process.argv[limitArg + 1]) || Infinity : Infinity;
const CONC = 4; // 동시 추출 수(파일당 여러 PDF라 등기보다 낮게)

const safeDecode = (u) => {
  try {
    return decodeURIComponent(u);
  } catch {
    return u;
  }
};
const pickNonZero = (a, b) => (a === 0 && b !== 0 ? b : a);

// 한 분기에 분리 제출된 재무상태표/손익계산서 등 여러 추출 결과를 0 아닌 값 우선으로 병합.
function mergeExtracted(list) {
  if (list.length <= 1) return list[0];
  const pick = (sel) => list.reduce((acc, d) => pickNonZero(acc, sel(d)), 0);
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

const reports = (await getSlabFinancialReports()).filter(
  (r) => r.hasFile && r.fileUrls.length,
);
let targets = reports;
if (!ALL_QUARTERS) {
  // 회사별 최신 분기 1건만.
  const latest = new Map();
  for (const r of reports) {
    const ord = r.year * 100 + r.month;
    const prev = latest.get(r.companyId);
    if (!prev || ord > prev.year * 100 + prev.month) latest.set(r.companyId, r);
  }
  targets = [...latest.values()];
}
targets.sort((a, b) => a.nameKr.localeCompare(b.nameKr, "ko"));
console.log(
  `재무제표 파일 보유 분기 ${reports.length}건 → 대상 ${targets.length}건 (${ALL_QUARTERS ? "전체 분기" : "회사별 최신"})`,
);

if (DRY) {
  for (const t of targets.slice(0, LIMIT)) {
    const warn = t.fileUrls.some((u) => isSupportedFile("", u))
      ? ""
      : "  ⚠️미지원형식";
    const multi = t.fileUrls.length > 1 ? `  (${t.fileUrls.length}파일)` : "";
    console.log(`  ${t.nameKr}  [${t.year} ${t.quarter}]  ${t.fileName}${multi}${warn}`);
  }
  console.log("\n(--dry-run: 추출·반영하지 않음)");
  process.exit(0);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("✗ .env.local 에 NEXT_PUBLIC_SUPABASE_URL·SUPABASE_SERVICE_ROLE_KEY 필요");
  process.exit(1);
}
if (!process.env.ANTHROPIC_API_KEY) {
  console.error("✗ .env.local 에 ANTHROPIC_API_KEY 필요");
  process.exit(1);
}

const supabase = createClient(url, key, { auth: { persistSession: false } });

let pool = targets;
if (SKIP_EXISTING) {
  const { data, error } = await supabase
    .from("financial_statements")
    .select("bubble_company_id, report_year, report_month");
  if (error) {
    console.error(`✗ 기존 행 조회 실패 — ${error.message}`);
    process.exit(1);
  }
  const have = new Set(
    (data ?? []).map((r) => `${r.bubble_company_id}|${r.report_year}|${r.report_month}`),
  );
  pool = targets.filter((t) => !have.has(`${t.companyId}|${t.year}|${t.month}`));
  console.log(`이미 저장된 분기 제외 → 남은 ${pool.length}건`);
}

const work = pool.slice(0, LIMIT);
if (LIMIT !== Infinity) console.log(`이번 실행: 앞 ${work.length}건`);

let done = 0;
let failed = 0;
let inconsistent = 0;

async function processOne(t) {
  try {
    // 연결 우선: 파일명에 '연결'(consolidated)이 있으면 그 파일만, 없으면 전체 파일
    // (분리 제출된 BS/IS 등) 추출 후 병합.
    const consolidated = t.fileUrls.filter((u) => /연결|consolidat/i.test(safeDecode(u)));
    const extractUrls = consolidated.length ? consolidated : t.fileUrls;
    const orderedUrls = consolidated.length
      ? [...consolidated, ...t.fileUrls.filter((u) => !consolidated.includes(u))]
      : t.fileUrls;

    const extracted = [];
    for (const u of extractUrls) {
      try {
        const f = await fetchSlabFile(u);
        if (!isSupportedFile(f.mediaType, f.fileName)) {
          console.log(`  · ${t.nameKr}: 미지원 형식 스킵(${f.fileName})`);
          continue;
        }
        extracted.push(await extractFromFile(f.bytes, f.mediaType, f.fileName));
      } catch (e) {
        console.log(
          `  · ${t.nameKr} (${safeDecode(u).split("/").pop()}): ${String(e?.message ?? e).slice(0, 100)}`,
        );
      }
    }
    if (extracted.length === 0) {
      failed++;
      console.log(`  ✗ ${t.nameKr}: 추출 실패(파일 전부 실패)`);
      return;
    }

    const d = mergeExtracted(extracted);
    const consistent = isBalanceConsistent({
      total_assets: d.totalAssets,
      total_liabilities: d.totalLiabilities,
      total_equity: d.totalEquity,
    });
    if (consistent === false) inconsistent++;

    const row = {
      company_name: t.nameKr,
      company_name_en: t.nameEn,
      bubble_company_id: t.companyId,
      report_year: t.year,
      report_month: t.month || d.month,
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
      funding_round: t.newFundingRound,
      funding_series: t.fundingSeries,
      total_raised: t.totalRaised,
      business_highlight: t.businessHighlight,
      head_count: t.headCount,
      source: "slab",
      source_file: t.fileName,
      source_file_url: orderedUrls.filter((u) => /^https?:/i.test(u)).join("\n"),
    };

    const { error } = await supabase
      .from("financial_statements")
      .upsert(row, { onConflict: "company_name,report_year,report_month" });
    if (error) {
      failed++;
      console.log(`  ✗ ${t.nameKr}: upsert 실패 — ${error.message}`);
      return;
    }
    done++;
    console.log(
      `  ✓ ${t.nameKr} [${t.year} ${t.quarter}]: 매출 ${d.revCurr.toLocaleString()} · 영업익 ${d.operatingIncome.toLocaleString()} · 자본총계 ${d.totalEquity.toLocaleString()}` +
        (consistent === false ? "  ⚠️자산≠부채+자본" : ""),
    );
  } catch (e) {
    failed++;
    console.log(`  ✗ ${t.nameKr}: ${String(e).slice(0, 140)}`);
  }
}

console.log(`\n=== 추출·upsert 시작 (동시 ${CONC}) ===`);
for (let i = 0; i < work.length; i += CONC) {
  await Promise.all(work.slice(i, i + CONC).map(processOne));
  process.stdout.write(`진행 ${done + failed}/${work.length}…\n`);
}

console.log(
  `\n=== 완료: ${done}건 반영, 실패 ${failed}건, 정합불일치 플래그 ${inconsistent}건 ===`,
);
