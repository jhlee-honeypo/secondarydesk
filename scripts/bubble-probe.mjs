// Bubble.io Data API 스키마 탐침 (일회성 검증용, 실제 연동 코드 아님).
//   1) /meta 로 노출된 데이터 타입 목록 발견
//   2) 각 타입에서 1건씩 받아 필드 구조 출력
// 실행: node scripts/bubble-probe.mjs            (모든 타입 1건씩)
//       node scripts/bubble-probe.mjs <타입명>   (특정 타입만, 최대 3건)
// 값은 .env.local 의 BUBBLE_API_BASE / BUBBLE_API_TOKEN 에서 읽는다.
import { readFileSync } from "node:fs";

// .env.local 수동 파싱 (node 는 자동 로드하지 않음)
function loadEnv() {
  try {
    const raw = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
    for (const line of raw.split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !process.env[m[1]]) {
        process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
      }
    }
  } catch {
    // .env.local 없으면 process.env 만 사용
  }
}
loadEnv();

const BASE = (process.env.BUBBLE_API_BASE || "").replace(/\/$/, "");
const TOKEN = process.env.BUBBLE_API_TOKEN || "";

if (!BASE || !TOKEN) {
  console.error(
    "✗ BUBBLE_API_BASE / BUBBLE_API_TOKEN 가 .env.local 에 필요합니다.\n" +
      "  예) BUBBLE_API_BASE=https://your-app.bubbleapps.io\n" +
      "      BUBBLE_API_TOKEN=xxxxxxxx",
  );
  process.exit(1);
}

const headers = { Authorization: `Bearer ${TOKEN}` };

async function get(path) {
  const url = `${BASE}/api/1.1${path}`;
  const res = await fetch(url, { headers });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }
  return { status: res.status, json, text };
}

// 값의 타입을 사람이 읽기 쉬운 형태로 요약
function describe(v) {
  if (v === null) return "null";
  if (Array.isArray(v)) return `array[${v.length}]`;
  if (typeof v === "object") return "object";
  if (typeof v === "string") {
    if (/^\d{4}-\d{2}-\d{2}T/.test(v)) return `date "${v}"`;
    return `string "${v.length > 40 ? v.slice(0, 40) + "…" : v}"`;
  }
  return `${typeof v} ${v}`;
}

function printFields(obj) {
  for (const [k, v] of Object.entries(obj)) {
    console.log(`    ${k}: ${describe(v)}`);
  }
}

async function main() {
  const onlyType = process.argv[2];

  if (!onlyType) {
    console.log(`\n● /meta — 노출된 데이터 타입 발견 (${BASE})`);
    const meta = await get("/meta");
    if (meta.status !== 200) {
      console.error(`✗ /meta ${meta.status}: ${meta.text.slice(0, 300)}`);
      console.error(
        "  → 토큰/베이스URL 확인. test 버전이면 BASE 끝에 /version-test 추가.",
      );
      process.exit(1);
    }
    const types = meta.json?.get ?? [];
    console.log(`  타입 ${types.length}개: ${types.join(", ")}`);

    for (const t of types) {
      const r = await get(`/obj/${encodeURIComponent(t)}?limit=1`);
      const row = r.json?.response?.results?.[0];
      const count = r.json?.response?.count;
      console.log(`\n● ${t}  (status ${r.status}, count ${count ?? "?"})`);
      if (row) printFields(row);
      else console.log("    (레코드 없음 또는 접근 불가)");
    }
  } else {
    const r = await get(`/obj/${encodeURIComponent(onlyType)}?limit=3`);
    console.log(`\n● ${onlyType}  (status ${r.status})`);
    const rows = r.json?.response?.results ?? [];
    rows.forEach((row, i) => {
      console.log(`\n  [${i}]`);
      printFields(row);
    });
    if (rows.length === 0) console.log("  (레코드 없음 또는 접근 불가)");
  }
  console.log("");
}

main().catch((e) => {
  console.error("✗ 오류:", e.message);
  process.exit(1);
});
