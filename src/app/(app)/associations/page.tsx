import { createClient } from "@/lib/supabase/server";
import { DryPowderInfo } from "../investors/_components/dry-powder-info";
import {
  AssociationsTable,
  type AssociationRow,
} from "./_components/associations-table";

export const dynamic = "force-dynamic";

export default async function AssociationsPage() {
  const supabase = await createClient();

  // 전체 투자사(GP)의 조합을 결성일 최신순으로 집계. PostgREST 기본 1000행 한도 →
  // range 로 페이지네이션해 전량 수집. 결성일 없는 조합은 맨 아래(nullsFirst:false).
  const rows: AssociationRow[] = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data } = await supabase
      .from("funds")
      .select("*, investor:investors(id, name)")
      .order("formation_date", { ascending: false, nullsFirst: false })
      .order("id")
      .range(from, from + PAGE - 1);
    const batch = (data ?? []) as AssociationRow[];
    rows.push(...batch);
    if (batch.length < PAGE) break;
  }

  // 최근 3개 연도(올해 포함 직전 2개) 결성 조합은 미소진 재원이 남아 있을 수 있어
  // 배경 하이라이트 — 투자사 상세의 운용 조합 섹션과 동일한 규칙.
  const currentYear = new Date().getFullYear();
  const HIGHLIGHT_FROM = currentYear - 2;

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">조합 탐색</h1>
          <p className="text-sm text-muted-foreground">
            DIVA에서 가져온 전체 투자사(GP)의 운용 조합을 결성일 최신순으로
            모았습니다. 조합 등록·수정은 각 투자사 상세에서 합니다.
          </p>
        </div>
        <DryPowderInfo />
      </div>

      <AssociationsTable
        rows={rows}
        highlightFrom={HIGHLIGHT_FROM}
        currentYear={currentYear}
      />
    </div>
  );
}
