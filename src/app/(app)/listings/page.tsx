import Link from "next/link";
import { Layers, Plus } from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import {
  LISTING_STATUS_LABEL,
  LISTING_STATUS_VARIANT,
  type HoldingFund,
  type ListingWithFunds,
} from "@/lib/types";
import { formatKRW } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { ListingFormDialog } from "./_components/listing-form-dialog";
import { ListingFilters } from "./_components/listing-filters";

export const dynamic = "force-dynamic";

export default async function ListingsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; fund?: string }>;
}) {
  const { status = "", fund = "" } = await searchParams;
  const supabase = await createClient();

  // 필터 드롭다운·태깅 폼에 쓸 운용펀드 목록
  const { data: fundRows } = await supabase
    .from("holding_funds")
    .select("*")
    .order("name");
  const holdingFunds = (fundRows ?? []) as HoldingFund[];

  // 운용펀드 필터: 해당 펀드에 태깅된 매물 id 집합을 먼저 구함
  let fundListingIds: string[] | null = null;
  if (fund) {
    const { data: lf } = await supabase
      .from("listing_funds")
      .select("listing_id")
      .eq("holding_fund_id", fund);
    fundListingIds = (lf ?? []).map((r) => r.listing_id as string);
  }

  let listings: ListingWithFunds[] = [];
  // 펀드 필터가 있는데 매칭 매물이 0개면 쿼리 생략
  if (!(fund && fundListingIds && fundListingIds.length === 0)) {
    let query = supabase
      .from("listings")
      .select(
        "*, listing_funds(holding_fund_id, holding_funds(id, name))",
      )
      .order("company_name");

    if (status) query = query.eq("status", status);
    if (fundListingIds) query = query.in("id", fundListingIds);

    const { data } = await query;
    listings = (data ?? []) as ListingWithFunds[];
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">매물</h1>
          <p className="text-sm text-muted-foreground">
            매각 대상 포트폴리오사 구주를 등록하고 소속 운용펀드로 태깅합니다.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" asChild>
            <Link href="/listings/funds">
              <Layers />
              운용펀드 관리
            </Link>
          </Button>
          <ListingFormDialog
            trigger={
              <Button>
                <Plus />
                매물
              </Button>
            }
            holdingFunds={holdingFunds}
          />
        </div>
      </div>

      <ListingFilters holdingFunds={holdingFunds} status={status} fund={fund} />

      {listings.length === 0 ? (
        <Card className="items-center justify-center py-16 text-center">
          <p className="text-sm text-muted-foreground">
            {status || fund
              ? "조건에 맞는 매물이 없습니다. 필터를 조정해 보세요."
              : "아직 등록된 매물이 없습니다. 오른쪽 위 “매물” 버튼으로 첫 매물을 등록하세요."}
          </p>
        </Card>
      ) : (
        <Card className="p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th className="px-4 py-2.5 font-medium">회사명</th>
                <th className="px-4 py-2.5 font-medium">상태</th>
                <th className="px-4 py-2.5 font-medium">최신 밸류</th>
                <th className="px-4 py-2.5 font-medium">소속 운용펀드</th>
              </tr>
            </thead>
            <tbody>
              {listings.map((listing) => {
                const fundNames = listing.listing_funds
                  .map((lf) => lf.holding_funds?.name)
                  .filter(Boolean) as string[];
                return (
                  <tr
                    key={listing.id}
                    className="border-b border-border last:border-0 hover:bg-muted/40"
                  >
                    <td className="px-4 py-3">
                      <Link
                        href={`/listings/${listing.id}`}
                        className="font-medium text-foreground hover:text-primary hover:underline"
                      >
                        {listing.company_name}
                      </Link>
                      {listing.sector && (
                        <span className="ml-2 text-xs text-muted-foreground">
                          {listing.sector}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={LISTING_STATUS_VARIANT[listing.status]}>
                        {LISTING_STATUS_LABEL[listing.status]}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {formatKRW(listing.asking_valuation)}
                    </td>
                    <td className="px-4 py-3">
                      {fundNames.length === 0 ? (
                        <span className="text-muted-foreground">—</span>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {fundNames.map((name) => (
                            <Badge key={name} variant="outline">
                              {name}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
