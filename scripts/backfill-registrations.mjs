// 일회성 백필: slab 분기보고에 첨부된 법인등기부등본(회사별 최신 1건)을 Claude 로
// 추출해 Supabase `corporate_registrations` 에 회사당 1행 upsert 한다.
// (설립일·본점·발행주식). slab-bot 이 이 표를 service-role 로 읽어 설립연도·소재지
// 질문에 정확히 답하게 하는 것이 목적(A 기능).
//
// Node 24 가 아래 .ts 라이브러리를 타입 스트리핑으로 직접 로드한다(별칭 import 없음).
//
// 사전조건:
//   1) supabase/migrations/20260715000000_corporate_registrations.sql 이 DB 에 적용됨
//   2) .env.local 에 ANTHROPIC_API_KEY, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
//
// 사용:
//   node --env-file=.env.local scripts/backfill-registrations.mjs             (전량 반영)
//   node --env-file=.env.local scripts/backfill-registrations.mjs --dry-run   (대상만 나열·추출 안 함·무료)
//   node --env-file=.env.local scripts/backfill-registrations.mjs --limit 3   (앞 3건만 — 소액 테스트)

import { createClient } from "@supabase/supabase-js";
import { getSlabCorporateRegisters, fetchSlabFile } from "../src/lib/bubble.ts";
import {
  extractFromRegistryFile,
  extractFromRegistryUrl,
  sharesConsistent,
  isSupportedFile,
} from "../src/lib/registry-extract.ts";

const DRY = process.argv.includes("--dry-run");
const SKIP_EXISTING = process.argv.includes("--skip-existing"); // 이미 DB에 있는 회사 건너뜀(재실행·크레딧 절약)
const limitArg = process.argv.indexOf("--limit");
const LIMIT =
  limitArg >= 0 ? Number(process.argv[limitArg + 1]) || Infinity : Infinity;
const CONC = 6; // 동시 추출 수(Anthropic API 부하 완화)

// 빈 문자열 → null (Postgres date/numeric 컬럼용)
const dateOrNull = (s) => (s ? s : null);
const numOrNull = (n) => (n > 0 ? n : null);

const all = await getSlabCorporateRegisters();
console.log(`등기부등본 보유 회사: ${all.length}곳`);

if (DRY) {
  // 대상만 나열 — Bubble 만 조회, 키 불필요.
  for (const t of all.slice(0, LIMIT)) {
    const warn = isSupportedFile("", t.fileName) ? "" : "  ⚠️미지원형식";
    console.log(`  ${t.nameKr}  [${t.year} ${t.quarter}]  ${t.fileName}${warn}`);
  }
  console.log("\n(--dry-run: 추출·반영하지 않음)");
  process.exit(0);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error(
    "✗ .env.local 에 NEXT_PUBLIC_SUPABASE_URL 과 SUPABASE_SERVICE_ROLE_KEY 가 필요합니다.",
  );
  process.exit(1);
}
if (!process.env.ANTHROPIC_API_KEY) {
  console.error("✗ .env.local 에 ANTHROPIC_API_KEY 가 필요합니다.");
  process.exit(1);
}

const supabase = createClient(url, key, { auth: { persistSession: false } });

let pool = all;
if (SKIP_EXISTING) {
  const { data, error } = await supabase
    .from("corporate_registrations")
    .select("bubble_company_id");
  if (error) {
    console.error(`✗ 기존 행 조회 실패 — ${error.message}`);
    process.exit(1);
  }
  const have = new Set((data ?? []).map((r) => r.bubble_company_id));
  pool = all.filter((t) => !have.has(t.companyId));
  console.log(`이미 저장된 ${have.size}곳 제외 → 남은 ${pool.length}곳`);
}

const targets = pool.slice(0, LIMIT);
if (LIMIT !== Infinity) console.log(`이번 실행: 앞 ${targets.length}곳`);

let done = 0;
let failed = 0;
let inconsistent = 0;

async function processOne(t) {
  try {
    let d;
    let srcName = t.fileName;
    try {
      const f = await fetchSlabFile(t.fileUrl);
      if (!isSupportedFile(f.mediaType, f.fileName)) {
        failed++;
        console.log(`  ✗ ${t.nameKr}: 미지원 형식(${f.mediaType}, ${f.fileName})`);
        return;
      }
      srcName = f.fileName;
      d = await extractFromRegistryFile(f.bytes, f.mediaType, f.fileName);
    } catch (e) {
      // 요청 본문 초과(413)면 base64 대신 URL 방식으로 재시도(Anthropic 이 직접 다운로드).
      if (/413|request_too_large|too large/i.test(String(e?.message ?? e))) {
        console.log(`  ↻ ${t.nameKr}: 파일 큼 → URL 방식 재시도`);
        d = await extractFromRegistryUrl(t.fileUrl);
      } else throw e;
    }
    const consistent = sharesConsistent(d);
    if (!consistent) inconsistent++;

    const row = {
      company_name: t.nameKr,
      company_name_en: t.nameEn,
      bubble_company_id: t.companyId,
      established_date: dateOrNull(d.establishedDate),
      head_office_address: d.headOfficeAddress || null,
      head_office_city: d.headOfficeCity || null,
      issue_date: dateOrNull(d.issueDate),
      total_issued_shares: numOrNull(d.totalIssuedShares),
      shares_by_type: d.sharesByType,
      shares_as_of_date: dateOrNull(d.sharesAsOfDate),
      source: "slab",
      source_file: srcName,
      source_file_url: t.fileUrl,
    };

    const { error } = await supabase
      .from("corporate_registrations")
      .upsert(row, { onConflict: "bubble_company_id" });
    if (error) {
      failed++;
      console.log(`  ✗ ${t.nameKr}: upsert 실패 — ${error.message}`);
      return;
    }
    done++;
    console.log(
      `  ✓ ${t.nameKr}: 설립 ${d.establishedDate || "?"} · ${d.headOfficeCity || "?"} · 주식 ${d.totalIssuedShares || 0}` +
        (consistent ? "" : "  ⚠️종류합≠총수"),
    );
  } catch (e) {
    failed++;
    console.log(`  ✗ ${t.nameKr}: ${String(e).slice(0, 140)}`);
  }
}

console.log(`\n=== 추출·upsert 시작 (동시 ${CONC}) ===`);
for (let i = 0; i < targets.length; i += CONC) {
  await Promise.all(targets.slice(i, i + CONC).map(processOne));
  process.stdout.write(`진행 ${done + failed}/${targets.length}…\n`);
}

console.log(
  `\n=== 완료: ${done}건 반영, 실패 ${failed}건, 종류합불일치 플래그 ${inconsistent}건 ===`,
);
