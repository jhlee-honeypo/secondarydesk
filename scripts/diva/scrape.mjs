// DIVA 조합 전량 자동 스크래퍼 (로컬 전용). 진짜 크롬으로 WAF를 통과한 뒤
// 검색 폼(#asctInfo)을 TOTAL_YN=Y로 한 번 POST → 전체 조합 HTML을 받아 파싱한다.
// 매 분기 갱신 시 이것만 돌리면 됨.
//
// 사용: node scripts/diva/scrape.mjs            (기본: 보이는 창)
//       node scripts/diva/scrape.mjs --headless (창 없이)
//       node scripts/diva/scrape.mjs 202603     (특정 공시연월)
// 출력물(page.html·funds.csv·funds.json)은 tmp/diva-recon/out/ 에 저장(=.gitignore).

import { chromium } from "playwright";
import { writeFileSync } from "node:fs";
import path from "node:path";
import { parseFunds, writeOutputs, summarize } from "./parse.mjs";

const PAGE_URL = "http://diva.kvca.or.kr/div/dii/DivItmAssoInq";
const OUT_DIR = path.resolve("tmp/diva-recon/out");
const headless = process.argv.includes("--headless");
const yymm = process.argv.find((a) => /^\d{6}$/.test(a)) || null;

const browser = await chromium.launch({ headless });
const context = await browser.newContext({
  ignoreHTTPSErrors: true,
  locale: "ko-KR",
  timezoneId: "Asia/Seoul",
});
const page = await context.newPage();

console.log("DIVA 접속…");
await page.goto(PAGE_URL, { waitUntil: "domcontentloaded", timeout: 60_000 });
await page.waitForSelector("form#asctInfo", { timeout: 30_000 });

console.log("전체 조합 조회 요청(TOTAL_YN=Y)…");
const html = await page.evaluate(async (yymmArg) => {
  const form = document.querySelector("form#asctInfo");
  const fd = new FormData(form);
  fd.set("TOTAL_YN", "Y"); // 전량
  fd.set("PAGE_INDEX", "1");
  if (yymmArg) fd.set("S_DISCLS_YYMM", yymmArg);
  const body = new URLSearchParams(
    [...fd.entries()].map(([k, v]) => [k, String(v)]),
  ).toString();
  const res = await fetch(form.action, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8" },
    body,
  });
  return await res.text();
}, yymm);

await browser.close();

writeFileSync(path.join(OUT_DIR, "page.html"), html);
const rows = parseFunds(html);
if (rows.length === 0) {
  console.error(
    "⚠ 0건 파싱 — WAF 차단이거나 폼 구조 변경 가능. out/page.html 확인 필요.",
  );
  process.exit(1);
}
writeOutputs(rows);
summarize(rows);
console.log("→ out/page.html, out/funds.json, out/funds.csv");
