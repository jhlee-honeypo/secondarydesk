"use server";

import { createClient } from "@/lib/supabase/server";
import {
  computeMetrics,
  gradeHealth,
  isBalanceConsistent,
  HEALTH_LABEL,
} from "@/lib/financial-health";
import type { FinancialStatement } from "@/lib/types";
import { RAW_COLS } from "./_components/raw-columns";

// 회사명 매칭 규칙 — financials/history-actions.ts 의 normName 과 같아야 한다
// (다르면 화면에서 펼쳐 보이던 분기가 CSV 에서 빠진다). "use server" 파일은
// async 함수만 내보낼 수 있어 공유하지 못하고 같은 규칙을 다시 적는다.
function normName(s: string): string {
  return s
    .toLowerCase()
    .replace(/㈜|\(주\)|주식회사/g, "")
    .replace(/[\s.,·]/g, "");
}

function csvCell(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "number") return String(v); // 숫자는 그대로 — 엑셀이 수로 읽게
  const s = v.replace(/\r?\n/g, " ");
  return /[",]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * 화면에 걸린 필터 대상 회사들의 **전 분기** 재무 행을 CSV 로.
 *
 * 화면 표는 회사당 최신 분기 한 줄만 펼쳐 놓으므로 클라이언트에는 과거 분기가
 * 없다. 그래서 내려받기는 서버에서 다시 읽는다 — 파일에는 펼치지 않은 분기까지
 * 전부 담긴다(엑셀에서 회사별 시계열을 그대로 쓰려는 것이 이 탭의 용도).
 */
export async function exportFinancialCsv(
  companies: { id: string; name: string }[],
): Promise<string> {
  const supabase = await createClient();
  const { data } = await supabase.from("financial_statements").select("*");

  const ids = new Set(companies.map((c) => c.id));
  const names = new Set(companies.map((c) => normName(c.name)));
  const rows = ((data ?? []) as FinancialStatement[]).filter(
    (f) =>
      (f.bubble_company_id && ids.has(f.bubble_company_id)) ||
      names.has(normName(f.company_name)),
  );

  rows.sort(
    (a, b) =>
      a.company_name.localeCompare(b.company_name, "ko") ||
      b.report_year * 100 + b.report_month - (a.report_year * 100 + a.report_month),
  );

  const header = [
    "회사",
    "영문명",
    "slab ID",
    "연도",
    "분기",
    "보고월",
    "통화",
    ...RAW_COLS.map((c) => c.label),
    "건전성",
    "정합",
    "원본 파일",
    "원본 URL",
    "갱신일시",
  ];

  const lines = rows.map((f) => {
    const consistent = isBalanceConsistent(f);
    return [
      f.company_name,
      f.company_name_en,
      f.bubble_company_id,
      f.report_year,
      f.report_month / 3,
      f.report_month,
      f.currency,
      ...RAW_COLS.map((c) => c.get(f)),
      HEALTH_LABEL[gradeHealth(f, computeMetrics(f)).level],
      consistent === null ? "" : consistent ? "정합" : "불일치",
      f.source_file,
      f.source_file_url?.split("\n").find((u) => /^https?:/i.test(u.trim()))?.trim() ??
        "",
      f.updated_at,
    ];
  });

  const body = [header, ...lines]
    .map((r) => r.map(csvCell).join(","))
    .join("\r\n");

  // 선두 BOM — 없으면 엑셀이 UTF-8 을 못 알아보고 한글이 깨진다.
  return "﻿" + body;
}
