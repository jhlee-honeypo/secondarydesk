// DIVA 조합 조회 정찰 스크립트 (로컬 전용, 일회성)
//
// 목적: 저(Claude)는 WAF·지역차단 때문에 DIVA에 못 들어갑니다. 이 스크립트는
// 준행님 PC에서 "진짜 크롬"을 띄워(=WAF 통과) 조합 검색을 직접 하게 하고,
// 그 사이 오간 네트워크 요청/응답·페이지 HTML을 전부 파일로 떨궈줍니다.
// 그 결과를 보고 본 스크래퍼의 데이터 형식(JSON 엔드포인트냐 HTML 표냐)을 확정합니다.
//
// ⚠ 출력물(network.json)에는 로그인/세션 쿠키가 담길 수 있습니다. 커밋 금지.
//   (tmp/ 는 .gitignore 처리됨)
//
// 사용법 (프로젝트 루트에서):
//   npm i -D playwright
//   npx playwright install chromium
//   node scripts/diva/recon.mjs
//   # (다른 시작 URL을 쓰려면)  node scripts/diva/recon.mjs "http://diva.kvca.or.kr/..."
//
// 출력물은 tmp/diva-recon/out/ 에 저장됨(쿠키 포함 → /tmp/ 는 .gitignore 처리).

import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import readline from "node:readline";

const START_URL =
  process.argv[2] || "http://diva.kvca.or.kr/div/dii/DivItmAssoInq";
const OUT = path.resolve("tmp/diva-recon/out");

await mkdir(OUT, { recursive: true });

/** @type {any[]} */
const log = [];
let seq = 0;

const browser = await chromium.launch({ headless: false });
const context = await browser.newContext({
  ignoreHTTPSErrors: true, // DIVA 인증서가 깨져 있음
  locale: "ko-KR",
  timezoneId: "Asia/Seoul",
});
const page = await context.newPage();

// 모든 응답을 기록. XHR/Fetch·JSON·HTML 본문은 파일로 저장한다.
context.on("response", async (response) => {
  const req = response.request();
  const type = req.resourceType();
  const ct = response.headers()["content-type"] ?? "";
  const entry = {
    seq: ++seq,
    method: req.method(),
    url: response.url(),
    resourceType: type,
    status: response.status(),
    contentType: ct,
    postData: req.postData() ?? null, // 검색 파라미터 재현용
  };
  const interesting =
    type === "xhr" || type === "fetch" || ct.includes("json");
  if (interesting) {
    try {
      const body = await response.body();
      const ext = ct.includes("json") ? "json" : ct.includes("html") ? "html" : "txt";
      const fname = `body-${String(entry.seq).padStart(3, "0")}-${type}.${ext}`;
      await writeFile(path.join(OUT, fname), body);
      entry.bodyFile = fname;
      entry.bodyBytes = body.length;
      entry.requestHeaders = req.headers(); // 헤더/쿠키 — 재현 시 필요할 수 있음
    } catch (e) {
      entry.bodyError = String(e);
    }
  }
  log.push(entry);
});

console.log("\n크롬이 열립니다. 창에서 DIVA 조합 검색을 직접 수행하세요.");
console.log("(검색어 입력 → 검색 버튼 클릭, 다음 페이지로 한두 번 넘겨보면 더 좋습니다)\n");

try {
  await page.goto(START_URL, { waitUntil: "domcontentloaded", timeout: 60_000 });
} catch (e) {
  console.log(
    `초기 이동 실패 — 열린 크롬 주소창에 직접 diva.kvca.or.kr 를 입력해 조합 조회로 이동하세요. (${e.message})`,
  );
}

await new Promise((resolve) => {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  rl.question("검색을 마쳤으면 여기(터미널)에서 Enter ▶ ", () => {
    rl.close();
    resolve();
  });
});

// 덤프
await writeFile(path.join(OUT, "page.html"), await page.content());
await page
  .screenshot({ path: path.join(OUT, "screenshot.png"), fullPage: true })
  .catch(() => {});
await writeFile(
  path.join(OUT, "network.json"),
  JSON.stringify({ finalUrl: page.url(), startUrl: START_URL, requests: log }, null, 2),
);

console.log(`\n저장 완료 → ${OUT}`);
console.log("  page.html · screenshot.png · network.json · body-*.{json,html}\n");
console.log("데이터를 실어 나른 것으로 의심되는 XHR/Fetch 요청:");
const xhr = log.filter((e) => e.resourceType === "xhr" || e.resourceType === "fetch");
if (xhr.length === 0) {
  console.log("  (없음 — 서버렌더 HTML일 가능성. page.html 을 보면 됩니다.)");
} else {
  for (const e of xhr) {
    console.log(
      `  [${e.method}] ${e.status} ${e.url}${e.bodyFile ? "  → " + e.bodyFile : ""}`,
    );
  }
}

await browser.close();
