import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/supabase/auth";
import type { DealCard, UserRow } from "@/lib/types";
import { DealBoard } from "./_components/deal-board";

export const dynamic = "force-dynamic";

export default async function DealsPage() {
  const supabase = await createClient();
  const me = await getCurrentUser();

  const [
    { data: dealRows },
    { data: listingRows },
    { data: investorRows },
    { data: fundRows },
    { data: userRows },
  ] = await Promise.all([
    supabase
      .from("deals")
      .select(
        "*, listing:listings(id, company_name), investor:investors(id, name), owner:users(id, name, email)",
      )
      .order("created_at", { ascending: false }),
    supabase.from("listings").select("id, company_name").order("company_name"),
    supabase.from("investors").select("id, name").order("name"),
    supabase.from("funds").select("id, name, investor_id").order("name"),
    supabase.from("users").select("id, name, email, role").order("name"),
  ]);

  const deals = (dealRows ?? []) as DealCard[];
  const listings = (listingRows ?? []) as { id: string; company_name: string }[];
  const investors = (investorRows ?? []) as { id: string; name: string }[];
  const funds = (fundRows ?? []) as {
    id: string;
    name: string;
    investor_id: string;
  }[];
  const users = (userRows ?? []) as UserRow[];

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
      />
    </div>
  );
}
