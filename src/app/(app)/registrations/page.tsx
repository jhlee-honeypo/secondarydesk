import { createClient } from "@/lib/supabase/server";
import type { CorporateRegistration } from "@/lib/types";
import { getAllBubbleCompanies } from "@/lib/bubble";
import { fundLabel } from "@/lib/format";
import { Card } from "@/components/ui/card";
import { RegistrationsTable, type RegistrationRow } from "./_components/registrations-table";

export const dynamic = "force-dynamic";

export default async function RegistrationsPage() {
  const supabase = await createClient();

  // slab 전체 기업(기준 목록) + 등기 추출값 + 조합명 매핑용 운용펀드
  const [{ data: regData }, { data: fundRows }, companies] = await Promise.all([
    supabase.from("corporate_registrations").select("*"),
    supabase.from("holding_funds").select("id, name, short_name, bubble_id"),
    getAllBubbleCompanies().catch(() => []),
  ]);

  const regByCompany = new Map<string, CorporateRegistration>();
  for (const r of (regData ?? []) as CorporateRegistration[]) {
    if (r.bubble_company_id) regByCompany.set(r.bubble_company_id, r);
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

  // 기준: slab 전체 기업. (Bubble 조회 실패 시 저장된 등기만으로 폴백)
  const base =
    companies.length > 0
      ? companies.map((c) => ({
          companyId: c.id,
          companyName: c.nameKr,
          companyNameEn: c.nameEn,
          fundIds: c.fundIds,
        }))
      : [...regByCompany.values()].map((r) => ({
          companyId: r.bubble_company_id as string,
          companyName: r.company_name,
          companyNameEn: r.company_name_en,
          fundIds: [] as string[],
        }));

  const rows: RegistrationRow[] = base
    .map((c) => {
      const funds = c.fundIds
        .map((sid) => fundBySlabId.get(sid))
        .filter((v): v is { id: string; label: string } => Boolean(v));
      return {
        companyId: c.companyId,
        companyName: c.companyName,
        companyNameEn: c.companyNameEn,
        fundIds: funds.map((f) => f.id),
        reg: regByCompany.get(c.companyId) ?? null,
      };
    })
    // 등기 있는 기업 먼저(이름순), "정보 없음"은 맨 하단(이름순) — 조합 필터 후에도 유지
    .sort((a, b) => {
      if (!!a.reg !== !!b.reg) return a.reg ? -1 : 1;
      return a.companyName.localeCompare(b.companyName, "ko");
    });

  const usedFundIds = new Set(rows.flatMap((r) => r.fundIds));
  const fundOptions = [...fundBySlabId.values()]
    .filter((f) => usedFundIds.has(f.id))
    .map((f) => ({ value: f.id, label: f.label }))
    .sort((a, b) => a.label.localeCompare(b.label, "ko"));

  const withReg = rows.filter((r) => r.reg).length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">등기 정보</h1>
        <p className="text-sm text-muted-foreground">
          slab 전체 기업 기준 법인등기부등본 현황입니다. 분기보고에 등기가 첨부된
          기업은 추출값(설립일·본점·발행주식)을, 없으면 “정보 없음”으로 표시합니다.
          전체 {rows.length}곳 중 등기 {withReg}곳.
        </p>
      </div>

      {rows.length === 0 ? (
        <Card className="p-10 text-center text-sm text-muted-foreground">
          표시할 기업이 없습니다.
        </Card>
      ) : (
        <RegistrationsTable rows={rows} fundOptions={fundOptions} />
      )}
    </div>
  );
}
