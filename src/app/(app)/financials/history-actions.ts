"use server";

import { createClient } from "@/lib/supabase/server";
import type { FinancialStatement } from "@/lib/types";

// 회사명 매칭용 정규화 — 재무 점검 표(page.tsx normName)와 같은 규칙이어야 한다.
// 그러지 않으면 표에서는 매칭되던 분기가 이력에서 빠진다.
function normName(s: string): string {
  return s
    .toLowerCase()
    .replace(/㈜|\(주\)|주식회사/g, "")
    .replace(/[\s.,·]/g, "");
}

/** 한 기업의 분기별 재무 이력 전체(최신 분기 먼저).
 *
 *  매칭은 표와 동일하게 bubble_company_id → 정규화된 회사명 순서로 본다.
 *  정규화는 SQL 로 옮기기 어렵고 financial_statements 는 규모가 작아(수백 행)
 *  전부 읽어 메모리에서 거른다 — 표 렌더도 같은 방식으로 전량을 읽는다.
 *  exact eq 로만 걸렀을 때는 bubble_company_id 가 비고 이름 표기가 다른
 *  옛 업로드 행이 누락됐다. */
export async function listFinancialHistory(
  bubbleCompanyId: string | null,
  companyName: string | null,
): Promise<FinancialStatement[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("financial_statements").select("*");

  const key = companyName ? normName(companyName) : "";
  const rows = ((data ?? []) as FinancialStatement[]).filter(
    (f) =>
      (bubbleCompanyId && f.bubble_company_id === bubbleCompanyId) ||
      (key && normName(f.company_name) === key),
  );

  // 같은 분기 행이 둘 이상이면(중복 적재 — 예: ㈜잇그린 2026Q1) 최근 갱신본만 남긴다.
  // 그대로 두면 같은 분기가 두 줄로 뜨고 그 사이 증감이 0 으로 계산돼 오해를 만든다.
  const byQuarter = new Map<string, FinancialStatement>();
  for (const f of rows) {
    const k = `${f.report_year}-${f.report_month}`;
    const kept = byQuarter.get(k);
    if (!kept || f.updated_at > kept.updated_at) byQuarter.set(k, f);
  }

  return [...byQuarter.values()].sort(
    (a, b) =>
      b.report_year * 100 + b.report_month - (a.report_year * 100 + a.report_month),
  );
}
