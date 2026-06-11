import Link from "next/link";
import { notFound } from "next/navigation";
import { Pencil, Plus, Trash2 } from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/supabase/auth";
import {
  DEAL_STAGE_VARIANT,
  LISTING_STATUS_LABEL,
  LISTING_STATUS_VARIANT,
  type DealCard,
  type HoldingFund,
  type ListingWithFunds,
  type UserRow,
} from "@/lib/types";
import { formatDate, formatKRW, formatWon } from "@/lib/format";
import { computeTotals } from "@/lib/exit-scenario";
import { rankFundsForListing, type FundWithInvestor } from "@/lib/match";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DeleteDialog } from "@/components/app/delete-dialog";
import { ListingFormDialog } from "../_components/listing-form-dialog";
import { MatchRecommendations } from "../_components/match-recommendations";
import { DealFormDialog } from "../../deals/_components/deal-form-dialog";
import { deleteDeal } from "../../deals/actions";
import { deleteListing } from "../actions";

const MATCH_TOP_N = 10;

export const dynamic = "force-dynamic";

export default async function ListingDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const me = await getCurrentUser();
  const [
    { data: listingRow },
    { data: fundRows },
    { data: dealRows },
    { data: investorRows },
    { data: investorFundRows },
    { data: userRows },
    { data: roundRows },
  ] = await Promise.all([
    supabase
      .from("listings")
      .select("*, listing_funds(holding_fund_id, holding_funds(id, name))")
      .eq("id", id)
      .single(),
    supabase.from("holding_funds").select("*").order("name"),
    supabase
      .from("deals")
      .select(
        "*, listing:listings(id, company_name), investor:investors(id, name), owner:users(id, name, email)",
      )
      .eq("listing_id", id)
      .order("created_at", { ascending: false }),
    supabase.from("investors").select("id, name").order("name"),
    supabase
      .from("funds")
      .select("*, investor:investors(id, name)")
      .order("name"),
    supabase.from("users").select("id, name, email, role").order("name"),
    supabase
      .from("exit_scenario_rounds")
      .select("round_no, label, amount, unit_price, shares")
      .eq("listing_id", id)
      .order("round_no", { ascending: true }),
  ]);

  if (!listingRow) notFound();

  const listing = listingRow as ListingWithFunds;
  const holdingFunds = (fundRows ?? []) as HoldingFund[];
  const selectedFundIds = listing.listing_funds.map((lf) => lf.holding_fund_id);
  const memberFunds = listing.listing_funds
    .map((lf) => lf.holding_funds)
    .filter((f): f is { id: string; name: string } => Boolean(f));

  const deals = (dealRows ?? []) as DealCard[];
  const allFunds = (investorFundRows ?? []) as FundWithInvestor[];

  // 투자 데이터(EXIT 시나리오 라운드) — 개요에 합계·라운드 표로 표시
  const rounds = (roundRows ?? []) as {
    round_no: number;
    label: string | null;
    amount: number;
    unit_price: number;
    shares: number;
  }[];
  const roundTotals = computeTotals(
    rounds.map((r) => ({
      amount: r.amount || 0,
      unitPrice: r.unit_price || 0,
      shares: r.shares || 0,
    })),
  );

  // 이 매물로 잠긴 딜 다이얼로그 옵션(투자사는 선택 가능 → 전체 목록·전체 조합 전달)
  const dealDialogProps = {
    listings: [{ id: listing.id, company_name: listing.company_name }],
    investors: (investorRows ?? []) as { id: string; name: string }[],
    funds: allFunds.map((f) => ({
      id: f.id,
      name: f.name,
      investor_id: f.investor_id,
    })),
    users: (userRows ?? []) as UserRow[],
    currentUserId: me?.id ?? "",
    lockListingId: listing.id,
  };

  // 적합도 추천(F7): 조합 mandate 기반 점수 Top N
  const todayStr = new Date().toISOString().slice(0, 10);
  const matches = rankFundsForListing(listing, allFunds, todayStr).slice(
    0,
    MATCH_TOP_N,
  );
  const dealtInvestorIds = deals.map((d) => d.investor_id);

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6">
      <Link
        href="/listings"
        className="text-sm text-muted-foreground hover:text-foreground"
      >
        ← 매물 목록
      </Link>

      {/* 헤더 */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">
              {listing.company_name}
            </h1>
            <Badge variant={LISTING_STATUS_VARIANT[listing.status]}>
              {LISTING_STATUS_LABEL[listing.status]}
            </Badge>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <ListingFormDialog
            trigger={
              <Button variant="outline" size="sm">
                <Pencil />
                매물 수정
              </Button>
            }
            listing={listing}
            selectedFundIds={selectedFundIds}
            holdingFunds={holdingFunds}
          />
          <DeleteDialog
            trigger={
              <Button variant="outline" size="icon-sm" aria-label="매물 삭제">
                <Trash2 />
              </Button>
            }
            title="매물을 삭제할까요?"
            description="이 매물과 연결된 딜·운용펀드 태그가 모두 함께 삭제됩니다. 되돌릴 수 없습니다."
            action={deleteListing.bind(null, listing.id)}
          />
        </div>
      </div>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">개요</TabsTrigger>
          <TabsTrigger value="funds">운용펀드 ({memberFunds.length})</TabsTrigger>
          <TabsTrigger value="deals">검토 투자사 ({deals.length})</TabsTrigger>
          <TabsTrigger value="match">추천 투자사</TabsTrigger>
        </TabsList>

        {/* 개요 */}
        <TabsContent value="overview">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">개요</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3">
                <div>
                  <dt className="text-xs text-muted-foreground">상태</dt>
                  <dd className="text-foreground">
                    {LISTING_STATUS_LABEL[listing.status]}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">섹터</dt>
                  <dd className="text-foreground">{listing.sector ?? "—"}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">단계</dt>
                  <dd className="text-foreground">{listing.stage ?? "—"}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">등록일</dt>
                  <dd className="text-foreground">
                    {formatDate(listing.created_at)}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">IR/티저 자료</dt>
                  <dd className="text-foreground">
                    {listing.deck_url ? (
                      <a
                        href={listing.deck_url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-primary hover:underline"
                      >
                        링크 열기
                      </a>
                    ) : (
                      "—"
                    )}
                  </dd>
                </div>
              </dl>

              {/* 투자 데이터(EXIT 시나리오 소스) */}
              <div className="border-t border-border pt-4">
                <p className="mb-3 text-sm font-medium">투자 데이터</p>
                {rounds.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    입력된 투자 데이터가 없습니다. “매물 수정”에서 라운드별
                    단가·주식수를 입력하세요.
                  </p>
                ) : (
                  <div className="space-y-3">
                    <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3">
                      <div>
                        <dt className="text-xs text-muted-foreground">
                          총 투자원금
                        </dt>
                        <dd className="text-foreground">
                          {formatWon(roundTotals.totalPrincipal)}원
                        </dd>
                      </div>
                      <div>
                        <dt className="text-xs text-muted-foreground">
                          총 보유 주식수
                        </dt>
                        <dd className="text-foreground">
                          {roundTotals.totalShares.toLocaleString("ko-KR")}주
                        </dd>
                      </div>
                      <div>
                        <dt className="text-xs text-muted-foreground">
                          가중평균 취득단가
                        </dt>
                        <dd className="text-foreground">
                          {formatWon(roundTotals.avgUnitPrice)}원/주
                        </dd>
                      </div>
                    </dl>

                    <div className="overflow-hidden rounded-lg border border-border">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-border text-left text-xs text-muted-foreground">
                            <th className="px-3 py-2 font-medium">라운드</th>
                            <th className="px-3 py-2 text-right font-medium">
                              투자 단가 (원/주)
                            </th>
                            <th className="px-3 py-2 text-right font-medium">
                              보유 주식수
                            </th>
                            <th className="px-3 py-2 text-right font-medium">
                              투자액 (원)
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {rounds.map((r, i) => (
                            <tr
                              key={r.round_no}
                              className="border-b border-border last:border-0"
                            >
                              <td className="px-3 py-2">
                                {r.label || `${i + 1}차`}
                              </td>
                              <td className="px-3 py-2 text-right tabular-nums">
                                {formatWon(r.unit_price)}
                              </td>
                              <td className="px-3 py-2 text-right tabular-nums">
                                {r.shares.toLocaleString("ko-KR")}
                              </td>
                              <td className="px-3 py-2 text-right tabular-nums">
                                {formatWon(r.amount)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* 소속 운용펀드 */}
        <TabsContent value="funds">
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              이 매물이 소속된 운용펀드입니다. 수정은 “매물 수정”에서 태그를
              변경하세요.
            </p>
            {memberFunds.length === 0 ? (
              <Card className="items-center justify-center py-12 text-center">
                <p className="text-sm text-muted-foreground">
                  소속 운용펀드가 없습니다.
                </p>
              </Card>
            ) : (
              <div className="flex flex-wrap gap-2">
                {memberFunds.map((f) => (
                  <Badge key={f.id} variant="secondary" className="text-sm">
                    {f.name}
                  </Badge>
                ))}
              </div>
            )}
          </div>
        </TabsContent>

        {/* 검토 중인 투자사 = 이 매물에 연결된 딜 */}
        <TabsContent value="deals">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-medium text-muted-foreground">
                이 매물을 검토 중인 투자사 (연결된 딜)
              </h2>
              <DealFormDialog
                {...dealDialogProps}
                trigger={
                  <Button size="sm">
                    <Plus />딜
                  </Button>
                }
              />
            </div>

            {deals.length === 0 ? (
              <Card className="items-center justify-center py-12 text-center">
                <p className="text-sm text-muted-foreground">
                  아직 이 매물을 검토 중인 투자사가 없습니다. 투자사를 골라 딜을
                  만들어 보세요.
                </p>
              </Card>
            ) : (
              <Card className="p-0">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-xs text-muted-foreground">
                      <th className="px-4 py-2.5 font-medium">투자사</th>
                      <th className="px-4 py-2.5 font-medium">단계</th>
                      <th className="px-4 py-2.5 font-medium">담당</th>
                      <th className="px-4 py-2.5 font-medium">예상금액</th>
                      <th className="px-4 py-2.5" />
                    </tr>
                  </thead>
                  <tbody>
                    {deals.map((deal) => (
                      <tr
                        key={deal.id}
                        className="border-b border-border last:border-0 hover:bg-muted/40"
                      >
                        <td className="px-4 py-3">
                          <Link
                            href={`/investors/${deal.investor_id}`}
                            className="font-medium text-foreground hover:text-primary hover:underline"
                          >
                            {deal.investor?.name ?? "—"}
                          </Link>
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant={DEAL_STAGE_VARIANT[deal.stage]}>
                            {deal.stage}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {deal.owner?.name ?? deal.owner?.email ?? "—"}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {formatKRW(deal.expected_amount)}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex justify-end gap-1">
                            <DealFormDialog
                              {...dealDialogProps}
                              deal={deal}
                              trigger={
                                <Button
                                  variant="ghost"
                                  size="icon-xs"
                                  aria-label="딜 수정"
                                >
                                  <Pencil />
                                </Button>
                              }
                            />
                            <DeleteDialog
                              trigger={
                                <Button
                                  variant="ghost"
                                  size="icon-xs"
                                  aria-label="딜 삭제"
                                >
                                  <Trash2 />
                                </Button>
                              }
                              title="딜을 삭제할까요?"
                              description={`'${deal.investor?.name ?? ""}' 딜을 삭제합니다.`}
                              action={deleteDeal.bind(null, deal.id, undefined)}
                            />
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>
            )}
          </div>
        </TabsContent>

        {/* 추천 투자사 — 적합도 매칭(F7) */}
        <TabsContent value="match">
          <MatchRecommendations
            listingId={listing.id}
            matches={matches}
            dealtInvestorIds={dealtInvestorIds}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
