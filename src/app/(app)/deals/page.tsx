import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/supabase/auth";
import type { DealCard, UserRow } from "@/lib/types";
import { fundLabel } from "@/lib/format";
import { DealBoard } from "./_components/deal-board";
import { listListingBundles } from "./actions";

export const dynamic = "force-dynamic";

export default async function DealsPage({
  searchParams,
}: {
  searchParams: Promise<{ closed?: string }>;
}) {
  const supabase = await createClient();
  const me = await getCurrentUser();
  const { closed } = await searchParams;
  const showClosed = closed === "1";

  // 카드·수정폼이 실제 쓰는 컬럼만 조회한다(select * 는 딜 수천 건에서 불필요한
  // 컬럼까지 직렬화·전송해 페이로드가 비대해진다).
  let dealsQuery = supabase
    .from("deals")
    .select(
      "id, stage, next_action, next_action_date, investor_id, listing_id, lost_reason, listing:listings(id, company_name), investor:investors(id, name), owner:users(id, name, email, first_name), stage_events:deal_stage_events(stage, changed_at)",
    )
    .order("created_at", { ascending: false });
  // 기본은 진행 중 딜만 로드한다. 종료(클로징·드랍)된 딜은 누적되면 수천 건이 되어
  // 보드 로드·렌더를 무겁게 하므로, '종료 딜 포함' 토글(?closed=1)일 때만 함께 불러온다.
  if (!showClosed) {
    dealsQuery = dealsQuery.not("stage", "in", "(클로징,드랍)");
  }

  const [
    { data: dealRows },
    { data: listingRows },
    { data: investorRows },
    { data: fundRows },
    { data: userRows },
    { data: holdingFundRows },
    { data: listingFundRows },
  ] = await Promise.all([
    dealsQuery,
    supabase.from("listings").select("id, company_name").order("company_name"),
    supabase.from("investors").select("id, name").order("name"),
    supabase.from("funds").select("id, name, investor_id").order("name"),
    supabase
      .from("users")
      .select("id, name, email, first_name, last_name, role")
      .order("name"),
    supabase.from("holding_funds").select("id, name, short_name").order("name"),
    supabase.from("listing_funds").select("listing_id, holding_fund_id"),
  ]);

  const listingBundles = await listListingBundles();

  // 조회 컬럼을 줄여 supabase-js 가 좁은 타입을 추론하므로 unknown 경유로 캐스팅한다
  // (카드·수정폼이 쓰는 필드는 모두 select 에 포함됨).
  const deals = (dealRows ?? []) as unknown as DealCard[];
  const listings = (listingRows ?? []) as { id: string; company_name: string }[];
  const investors = (investorRows ?? []) as { id: string; name: string }[];
  const funds = (fundRows ?? []) as {
    id: string;
    name: string;
    investor_id: string;
  }[];
  const users = (userRows ?? []) as UserRow[];
  // 화면 표시는 약칭 우선(없으면 전체명)
  const holdingFunds = (
    (holdingFundRows ?? []) as {
      id: string;
      name: string;
      short_name: string | null;
    }[]
  ).map((f) => ({ id: f.id, name: fundLabel(f) }));

  // 매물 → 소속 운용펀드 id 목록 매핑(딜 보드 필터·딜 생성 매물 그룹핑용)
  const listingFundMap: Record<string, string[]> = {};
  for (const lf of (listingFundRows ?? []) as {
    listing_id: string;
    holding_fund_id: string;
  }[]) {
    (listingFundMap[lf.listing_id] ??= []).push(lf.holding_fund_id);
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">딜 보드</h1>
        <p className="text-sm text-muted-foreground">
          매물 × 투자사 파이프라인. 카드를 드래그해 단계를 옮기면 즉시 저장됩니다.
        </p>
      </div>

      <DealBoard
        initialDeals={deals}
        listings={listings}
        investors={investors}
        funds={funds}
        users={users}
        currentUserId={me?.id ?? ""}
        holdingFunds={holdingFunds}
        listingFundMap={listingFundMap}
        listingBundles={listingBundles}
        showClosed={showClosed}
      />
    </div>
  );
}
