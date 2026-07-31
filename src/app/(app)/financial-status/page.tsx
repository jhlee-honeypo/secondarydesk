import { createClient } from "@/lib/supabase/server";
import type { FinancialStatement } from "@/lib/types";
import { getAllBubbleCompanies } from "@/lib/bubble";
import { fundLabel } from "@/lib/format";
import { Card } from "@/components/ui/card";
// quarterIndex 는 lib 에서 가져온다 — 표 컴포넌트("use client")에서 import 하면
// 서버 정렬에서 호출할 때 런타임 오류가 난다.
import { quarterIndex } from "@/lib/financial-health";
import {
  FinancialStatusTable,
  type FinStatusRow,
} from "./_components/financial-status-table";

export const dynamic = "force-dynamic";

export default async function FinancialStatusPage() {
  const supabase = await createClient();

  // slab 전체 기업(기준 목록) + 재무제표 추출값(분기 시계열) + 조합명 매핑용 운용펀드
  const [{ data: finData }, { data: fundRows }, companies] = await Promise.all([
    supabase
      .from("financial_statements")
      .select("*")
      .order("report_year", { ascending: false })
      .order("report_month", { ascending: false }),
    supabase.from("holding_funds").select("id, name, short_name, bubble_id"),
    getAllBubbleCompanies().catch(() => []),
  ]);

  // 회사별 최신 분기 재무행(desc 정렬이라 첫 건) + 분기 수
  const latestByCompany = new Map<string, FinancialStatement>();
  const countByCompany = new Map<string, number>();
  for (const f of (finData ?? []) as FinancialStatement[]) {
    const cid = f.bubble_company_id;
    if (!cid) continue;
    countByCompany.set(cid, (countByCompany.get(cid) ?? 0) + 1);
    if (!latestByCompany.has(cid)) latestByCompany.set(cid, f);
  }

  // slab fund _id → 운용펀드 {id, label} (조합명 표시·필터용)
  const fundBySlabId = new Map<string, { id: string; label: string }>();
  for (const f of fundRows ?? []) {
    if (f.bubble_id)
      fundBySlabId.set(f.bubble_id as string, {
        id: f.id as string,
        label: fundLabel(f as { name: string; short_name: string | null }),
      });
  }

  // 기준: slab 전체 기업. (Bubble 조회 실패 시 저장된 재무만으로 폴백)
  const base =
    companies.length > 0
      ? companies.map((c) => ({
          companyId: c.id,
          companyName: c.nameKr,
          companyNameEn: c.nameEn,
          fundIds: c.fundIds,
        }))
      : [...latestByCompany.values()].map((f) => ({
          companyId: f.bubble_company_id as string,
          companyName: f.company_name,
          companyNameEn: f.company_name_en,
          fundIds: [] as string[],
        }));

  const rows: FinStatusRow[] = base
    .map((c) => {
      const funds = c.fundIds
        .map((sid) => fundBySlabId.get(sid))
        .filter((v): v is { id: string; label: string } => Boolean(v));
      return {
        companyId: c.companyId,
        companyName: c.companyName,
        companyNameEn: c.companyNameEn,
        fundIds: funds.map((f) => f.id),
        latest: latestByCompany.get(c.companyId) ?? null,
        quarterCount: countByCompany.get(c.companyId) ?? 0,
      };
    })
    // 최신 분기 자료가 위로. 기준 분기 색(파랑/앰버)과 순서를 맞춰, 최신분기 기업이
    // 위에 모이고 뒤처진 기업일수록 아래로 내려가게 한다.
    // ① 재무 있는 기업 먼저 → ② 기준 분기 최신순 → ③ 같은 분기면 이름순.
    // "정보 없음"은 맨 하단(이름순).
    .sort((a, b) => {
      if (!!a.latest !== !!b.latest) return a.latest ? -1 : 1;
      if (a.latest && b.latest) {
        const diff = quarterIndex(b.latest) - quarterIndex(a.latest);
        if (diff !== 0) return diff;
      }
      return a.companyName.localeCompare(b.companyName, "ko");
    });

  const usedFundIds = new Set(rows.flatMap((r) => r.fundIds));
  const fundOptions = [...fundBySlabId.values()]
    .filter((f) => usedFundIds.has(f.id))
    .map((f) => ({ value: f.id, label: f.label }))
    .sort((a, b) => a.label.localeCompare(b.label, "ko"));

  const withFin = rows.filter((r) => r.latest).length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">재무 추출 현황</h1>
        <p className="text-sm text-muted-foreground">
          slab 전체 기업 기준 재무제표 추출 현황입니다. 분기보고에 첨부된 재무제표가
          추출된 기업은 최신 분기 지표(매출·영업이익·자본총계·건전성)와 재무상태표
          정합 여부를, 없으면 “정보 없음”으로 표시합니다. 전체 {rows.length}곳 중 재무{" "}
          {withFin}곳.
        </p>
      </div>

      {rows.length === 0 ? (
        <Card className="p-10 text-center text-sm text-muted-foreground">
          표시할 기업이 없습니다.
        </Card>
      ) : (
        <FinancialStatusTable rows={rows} fundOptions={fundOptions} />
      )}
    </div>
  );
}
