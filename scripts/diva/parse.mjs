// DIVA 조합 조회 결과 HTML → 구조화 rows. parseFunds()는 scrape.mjs에서도 재사용.
// 공동GP(공동업무집행조합원) 조합은 운용사별로 행을 분해한다: 한 조합에 GP가 A·B면
// (조합,A)·(조합,B) 두 행. 각 GP는 고유 OPER_INST_ID를 가지므로 같은 회사가 어느
// 조합에 끼든 동일 ID로 식별돼 회사 중복이 생기지 않는다.
// CLI: node scripts/diva/parse.mjs <html파일경로>   (기본: tmp/diva-recon/out/page.html)
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const OUT_DIR = path.resolve("tmp/diva-recon/out");

const stripTags = (s) =>
  s
    .replace(/<input[^>]*>/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();

const hidden = (cellHtml, name) => {
  const m = cellHtml.match(new RegExp(`name="${name}"\\s+value="([^"]*)"`, "i"));
  return m ? m[1] : null;
};

const num = (s) => {
  const n = (s || "").replace(/[^\d]/g, "");
  return n === "" ? null : Number(n);
};

// 회사명 셀 → 운용사(GP) 목록. 공동GP는 fn_aOperDetail 앵커가 GP마다 하나씩.
function parseGps(operCell) {
  const anchors = [
    ...operCell.matchAll(/<a\b[^>]*fn_aOperDetail[\s\S]*?<\/a>/gi),
  ].map((m) => m[0]);
  const src = anchors.length ? anchors : [operCell];
  const gps = [];
  for (const a of src) {
    const id = hidden(a, "OPER_INST_ID");
    const nm = stripTags(a);
    if (nm) gps.push({ operInstId: id, operInstNm: nm });
  }
  return gps;
}

export function parseFunds(html) {
  const tbody = html.match(/<tbody[\s\S]*?<\/tbody>/i);
  const scope = tbody ? tbody[0] : html;
  const trs = [...scope.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)].map((m) => m[1]);
  const rows = [];
  for (const tr of trs) {
    const tds = [...tr.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((m) => m[1]);
    if (tds.length < 6) continue;
    const asctCell = tds[2] ?? "";
    const asctNm = stripTags(asctCell);
    if (!asctNm) continue;
    const base = {
      asctId: hidden(asctCell, "ASCT_ID"),
      asctNm,
      regDate: stripTags(tds[3] ?? ""), // 등록일
      aum: num(stripTags(tds[4] ?? "")), // 결성총액(원)
      maturityDate: stripTags(tds[5] ?? ""), // 만기일
      invstFld: stripTags(tds[6] ?? ""), // 투자분야 구분
      purpose: stripTags(tds[7] ?? ""), // 목적구분
      applType: stripTags(tds[8] ?? ""), // 지원구분
    };
    // 공동GP는 운용사별로 행 분해
    for (const gp of parseGps(tds[1] ?? "")) {
      rows.push({ operInstId: gp.operInstId, operInstNm: gp.operInstNm, ...base });
    }
  }
  return rows;
}

const CSV_COLS = [
  ["operInstNm", "회사명"],
  ["asctNm", "조합명"],
  ["regDate", "등록일"],
  ["aum", "결성총액"],
  ["maturityDate", "만기일"],
  ["invstFld", "투자분야"],
  ["purpose", "목적구분"],
  ["applType", "지원구분"],
  ["asctId", "조합ID"],
  ["operInstId", "운용사ID"],
];

export function writeOutputs(rows) {
  writeFileSync(path.join(OUT_DIR, "funds.json"), JSON.stringify(rows, null, 2));
  const esc = (v) => {
    const s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [
    CSV_COLS.map((c) => c[1]).join(","),
    ...rows.map((r) => CSV_COLS.map((c) => esc(r[c[0]])).join(",")),
  ].join("\r\n");
  writeFileSync(path.join(OUT_DIR, "funds.csv"), "﻿" + csv, "utf8"); // BOM for Excel
}

export function summarize(rows) {
  const asct = new Set(rows.map((r) => r.asctId));
  const opers = new Set(rows.map((r) => r.operInstId));
  // 공동GP 조합: 같은 조합ID가 여러 운용사 행으로 분해된 것
  const perAsct = new Map();
  for (const r of rows) perAsct.set(r.asctId, (perAsct.get(r.asctId) ?? 0) + 1);
  const coGp = [...perAsct.values()].filter((n) => n > 1).length;
  console.log(`분해 행(조합×GP): ${rows.length}`);
  console.log(`고유 조합: ${asct.size}  (공동GP 조합: ${coGp})`);
  console.log(`고유 운용사(=등록될 투자사): ${opers.size}`);
  console.log(`운용사ID 누락 행: ${rows.filter((r) => !r.operInstId).length}`);
}

// --- CLI ---
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const htmlPath = process.argv[2] || path.join(OUT_DIR, "page.html");
  const rows = parseFunds(readFileSync(htmlPath, "utf8"));
  writeOutputs(rows);
  summarize(rows);
  console.log("→ out/funds.json, out/funds.csv");
}
