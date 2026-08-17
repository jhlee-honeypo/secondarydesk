// 일회성 백필: 이미 적재된 financial_statements 행의 표기 통화(currency)를 채운다.
//
// 왜 필요한가: currency 컬럼(20260817010000)이 생기기 전에 저장된 행은 전부 기본값
// KRW 다. 그런데 달러·대만달러로 재무제표를 내는 기업이 섞여 있어(휴스페이스·
// 폴리머라이즈·H2 Inc 등), 그대로 두면 표에서 $37,610 을 3.7만원으로 읽는다.
//
// 값은 재추출하지 않는다 — 통화만 판독한다(detectCurrency). 금액 자체는 문서에 적힌
// 숫자 그대로 이미 맞게 들어와 있고, 틀린 것은 '단위 해석'뿐이기 때문. 전체 재추출
// 대비 출력 토큰이 훨씬 적고, 사람이 교정한 값을 덮어쓸 위험도 없다.
//
// 진행 상황은 tmp/currency-backfill.json 에 남겨 재실행 시 이미 판독한 행을 건너뛴다
// (한 행당 Claude 호출 1회라, 중단·재시작이 곧 비용이다).
//
// 사용:
//   node --env-file=.env.local scripts/backfill-currency.mjs --dry-run   (대상만 나열·무료)
//   node --env-file=.env.local scripts/backfill-currency.mjs --limit 5   (앞 5건 — 소액 확인)
//   node --env-file=.env.local scripts/backfill-currency.mjs             (전량)

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { fetchSlabFile } from "../src/lib/bubble.ts";
import { detectCurrency, isSupportedFile } from "../src/lib/claude-extract.ts";

const DRY = process.argv.includes("--dry-run");
const limitArg = process.argv.indexOf("--limit");
const LIMIT = limitArg >= 0 ? Number(process.argv[limitArg + 1]) || Infinity : Infinity;
const CONC = 6; // Claude 호출 동시 수. 429 가 나면 실패로 기록되고 재실행 때 이어서 처리된다.
const CHECKPOINT = "tmp/currency-backfill.json";

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

/** 여러 URL 이 줄바꿈으로 이어져 있을 수 있다 — 첫 http URL 하나로 충분하다
 *  (같은 분기의 재무상태표·손익계산서가 서로 다른 통화일 수는 없다). */
function firstUrl(raw) {
  return (raw ?? "")
    .split("\n")
    .map((u) => u.trim())
    .find((u) => /^https?:/i.test(u));
}

const done = existsSync(CHECKPOINT) ? JSON.parse(readFileSync(CHECKPOINT, "utf8")) : {};
function saveCheckpoint() {
  mkdirSync("tmp", { recursive: true });
  writeFileSync(CHECKPOINT, JSON.stringify(done, null, 1));
}

const { data: rows, error } = await sb
  .from("financial_statements")
  .select("id, company_name, report_year, report_month, source_file_url, currency")
  .order("report_year", { ascending: false })
  .order("report_month", { ascending: false });
if (error) throw new Error(error.message);

const targets = rows
  .filter((r) => !done[r.id] && firstUrl(r.source_file_url))
  .slice(0, LIMIT);

const noFile = rows.filter((r) => !firstUrl(r.source_file_url)).length;
console.log(
  `전체 ${rows.length}행 · 원본 URL 없음 ${noFile}행(건너뜀) · 이미 판독 ${Object.keys(done).length}행 · 이번 대상 ${targets.length}행`,
);
// ⚠️ dry-run 도 process.exit 로 끊지 않는다 — 윈도우 Node 에서 열린 핸들이 남은 채
// 종료하면 libuv assertion(async.c) 으로 죽어 로그가 지저분해진다.
if (DRY) {
  for (const r of targets.slice(0, 20))
    console.log(`   ${r.company_name} ${r.report_year}Q${r.report_month / 3}`);
  if (targets.length > 20) console.log(`   … 외 ${targets.length - 20}건`);
}

let cursor = 0;
let updated = 0;
let same = 0;
let failed = 0;
const found = [];

async function worker() {
  for (;;) {
    if (DRY) return;
    const i = cursor++;
    if (i >= targets.length) return;
    const r = targets[i];
    const url = firstUrl(r.source_file_url);
    const label = `${r.company_name} ${r.report_year}Q${r.report_month / 3}`;

    try {
      const { bytes, mediaType, fileName } = await fetchSlabFile(url);
      if (!isSupportedFile(mediaType, fileName)) {
        console.log(`⏭  ${label}: 미지원 형식(${fileName})`);
        failed++;
        continue;
      }
      const { currency, evidence } = await detectCurrency(bytes, mediaType, fileName);
      done[r.id] = { currency, evidence };

      if (currency === r.currency) {
        same++;
      } else {
        const up = await sb
          .from("financial_statements")
          .update({ currency })
          .eq("id", r.id);
        if (up.error) throw new Error(up.error.message);
        updated++;
        found.push(`${label} → ${currency} (근거: ${evidence})`);
        console.log(`✅ ${label}: ${r.currency} → ${currency} · ${evidence}`);
      }
    } catch (e) {
      failed++;
      console.log(`❌ ${label}: ${e instanceof Error ? e.message : String(e)}`);
    }
    if ((i + 1) % 10 === 0) saveCheckpoint();
  }
}

await Promise.all(Array.from({ length: CONC }, worker));
saveCheckpoint();

console.log(
  `\n완료 — 통화 변경 ${updated}행 · KRW 확인 ${same}행 · 실패 ${failed}행 (체크포인트 ${CHECKPOINT})`,
);
if (found.length) {
  console.log("\n원화가 아닌 것으로 판독된 행:");
  for (const f of found) console.log(`   ${f}`);
}
