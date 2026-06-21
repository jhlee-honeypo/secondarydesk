// 일회성 backfill: 이미 스크랩해 둔 tmp/diva-recon/out/funds.json 의 등록일(regDate,
// 일단위)을 기존 funds.formation_date 에 채운다. import 코드가 과거엔 연도(vintage)만
// 저장했던 조합을 일단위로 보정. 조합ID(diva_asct_id) 기준으로 매칭한다.
//
// RLS 우회를 위해 service_role 키가 필요. .env.local 에서 읽는다:
//   NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
//
// 사용: node scripts/diva/backfill-formation-date.mjs            (실제 반영)
//       node scripts/diva/backfill-formation-date.mjs --dry-run  (미리보기)

import { readFileSync } from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const DRY = process.argv.includes("--dry-run");
const JSON_PATH = path.resolve("tmp/diva-recon/out/funds.json");

// .env.local 파싱(따옴표 제거)
function loadEnv() {
  const txt = readFileSync(path.resolve(".env.local"), "utf8");
  const env = {};
  for (const line of txt.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
  }
  return env;
}

const env = loadEnv();
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error(
    "✗ .env.local 에 NEXT_PUBLIC_SUPABASE_URL 과 SUPABASE_SERVICE_ROLE_KEY 가 필요합니다.",
  );
  process.exit(1);
}

const dateOnly = (s) => (s ?? "").match(/\d{4}-\d{2}-\d{2}/)?.[0] ?? null;
const yearOf = (s) => {
  const m = (s ?? "").match(/(\d{4})/);
  return m ? Number(m[1]) : null;
};

// 1) 스크랩 JSON → asctId 별 등록일(일단위)
const rows = JSON.parse(readFileSync(JSON_PATH, "utf8"));
const byAsct = new Map(); // asctId → "YYYY-MM-DD"
for (const r of rows) {
  const d = dateOnly(r.regDate);
  if (r.asctId && d && !byAsct.has(r.asctId)) byAsct.set(r.asctId, d);
}
console.log(`스크랩 등록일(일단위) 보유 조합ID: ${byAsct.size}개`);

const supabase = createClient(url, key, { auth: { persistSession: false } });

// 2) 기존 funds 조회 → diva_asct_id 있고 formation_date 비었거나 다른 것만 보정.
//    PostgREST 기본 1000행 한도 → range 로 페이지네이션해 전량 수집.
const funds = [];
const PAGE = 1000;
for (let from = 0; ; from += PAGE) {
  const { data, error } = await supabase
    .from("funds")
    .select("id, diva_asct_id, formation_date, vintage")
    .not("diva_asct_id", "is", null)
    .order("id")
    .range(from, from + PAGE - 1);
  if (error) {
    console.error("✗ funds 조회 실패:", error.message);
    process.exit(1);
  }
  funds.push(...(data ?? []));
  if (!data || data.length < PAGE) break;
}

const targets = [];
for (const f of funds ?? []) {
  const d = byAsct.get(f.diva_asct_id);
  if (!d) continue; // 스크랩에 등록일 없는 조합 — 건드리지 않음
  if (f.formation_date === d) continue; // 이미 정확 — skip
  targets.push({ id: f.id, formation_date: d, vintage: yearOf(d) });
}

console.log(
  `대상 funds: ${targets.length}개 (전체 DIVA 조합 ${funds?.length ?? 0}개 중)`,
);
if (DRY) {
  for (const t of targets.slice(0, 10))
    console.log(`  ${t.id} → ${t.formation_date}`);
  console.log(targets.length > 10 ? `  … 외 ${targets.length - 10}개` : "");
  console.log("(--dry-run: 반영 안 함)");
  process.exit(0);
}

// 3) 반영 — 동시성 제한 병렬 업데이트
let done = 0;
let failed = 0;
const CONC = 12;
for (let i = 0; i < targets.length; i += CONC) {
  const batch = targets.slice(i, i + CONC);
  const res = await Promise.all(
    batch.map((t) =>
      supabase
        .from("funds")
        .update({ formation_date: t.formation_date, vintage: t.vintage })
        .eq("id", t.id),
    ),
  );
  for (const r of res) {
    if (r.error) {
      failed++;
      if (failed <= 5) console.error("  업데이트 실패:", r.error.message);
    } else done++;
  }
  process.stdout.write(`\r보정 ${done}/${targets.length}…`);
}
console.log(`\n✓ 완료: ${done}개 보정, 실패 ${failed}개`);
