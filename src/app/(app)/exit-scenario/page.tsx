import { createClient } from "@/lib/supabase/server";
import { ExitScenarioTool } from "./_components/exit-scenario-tool";

export const dynamic = "force-dynamic";

export default async function ExitScenarioPage() {
  const supabase = await createClient();
  const [{ data: listingRows }, { data: holdingFundRows }, { data: lfRows }] =
    await Promise.all([
      supabase.from("listings").select("id, company_name").order("company_name"),
      supabase.from("holding_funds").select("id, name").order("name"),
      supabase.from("listing_funds").select("listing_id, holding_fund_id"),
    ]);

  const listings = (listingRows ?? []) as { id: string; company_name: string }[];
  const holdingFunds = (holdingFundRows ?? []) as { id: string; name: string }[];

  // 매물 → 소속 운용펀드 id 목록 매핑(매물 선택 전 조합 필터용)
  const listingFundMap: Record<string, string[]> = {};
  for (const lf of (lfRows ?? []) as {
    listing_id: string;
    holding_fund_id: string;
  }[]) {
    (listingFundMap[lf.listing_id] ??= []).push(lf.holding_fund_id);
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">EXIT 시나리오</h1>
        <p className="text-sm text-muted-foreground">
          매물별 투자 라운드를 입력하고 할인율에 따른 매각 손익을 시뮬레이션합니다.
        </p>
      </div>

      <ExitScenarioTool
        listings={listings}
        holdingFunds={holdingFunds}
        listingFundMap={listingFundMap}
      />
    </div>
  );
}
