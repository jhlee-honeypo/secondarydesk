import Link from "next/link";
import { notFound } from "next/navigation";
import { Pencil, Trash2 } from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import {
  LISTING_STATUS_LABEL,
  LISTING_STATUS_VARIANT,
  type HoldingFund,
  type ListingWithFunds,
} from "@/lib/types";
import { formatDate, formatWon, fundLabel } from "@/lib/format";
import { computeTotals } from "@/lib/exit-scenario";
import { rankFundsForListing, type FundWithInvestor } from "@/lib/match";
import { getErpCompanyOverview, type ErpCompanyOverview } from "@/lib/bubble";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DeleteDialog } from "@/components/app/delete-dialog";
import { ListingFormDialog } from "../_components/listing-form-dialog";
import { MatchRecommendations } from "../_components/match-recommendations";
import { ErpOverview, ErpUnmatchedNote } from "../_components/erp-overview";
import { deleteListing } from "../actions";

const MATCH_TOP_N = 10;

export const dynamic = "force-dynamic";

export default async function ListingDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ status?: string; fund?: string }>;
}) {
  const { id } = await params;
  const { status = "", fund = "" } = await searchParams;
  // 목록에서 넘어올 때 실린 필터를 "← 매물 목록" 복귀 링크에 다시 싣는다.
  const backParams = new URLSearchParams();
  if (status) backParams.set("status", status);
  if (fund) backParams.set("fund", fund);
  const backHref = backParams.toString()
    ? `/listings?${backParams.toString()}`
    : "/listings";
  const supabase = await createClient();

  const [
    { data: listingRow },
    { data: fundRows },
    { data: dealRows },
    { data: investorFundRows },
    { data: roundRows },
  ] = await Promise.all([
    supabase
      .from("listings")
      .select(
        "*, listing_funds(holding_fund_id, holding_funds(id, name, short_name))",
      )
      .eq("id", id)
      .single(),
    supabase.from("holding_funds").select("*").order("name"),
    supabase.from("deals").select("investor_id").eq("listing_id", id),
    supabase
      .from("funds")
      .select("*, investor:investors(id, name)")
      .order("name"),
    supabase
      .from("exit_scenario_rounds")
      .select("round_no, label, amount, unit_price, shares, holding_fund_id")
      .eq("listing_id", id)
      .order("round_no", { ascending: true }),
  ]);

  if (!listingRow) notFound();

  const listing = listingRow as ListingWithFunds;
  const holdingFunds = (fundRows ?? []) as HoldingFund[];
  const selectedFundIds = listing.listing_funds.map((lf) => lf.holding_fund_id);
  const memberFunds = listing.listing_funds
    .map((lf) => lf.holding_funds)
    .filter(
      (f): f is { id: string; name: string; short_name: string | null } =>
        Boolean(f),
    );

  const allFunds = (investorFundRows ?? []) as FundWithInvestor[];

  // 투자 데이터(EXIT 시나리오 라운드) — 개요에 합계·라운드 표로 표시
  const rounds = (roundRows ?? []) as {
    round_no: number;
    label: string | null;
    amount: number;
    unit_price: number;
    shares: number;
    holding_fund_id: string | null;
  }[];
  const roundTotals = computeTotals(
    rounds.map((r) => ({
      amount: r.amount || 0,
      unitPrice: r.unit_price || 0,
      shares: r.shares || 0,
    })),
  );
  // 라운드/스파크랩투자 소속 펀드 표시명 맵
  const fundNameById = new Map(holdingFunds.map((f) => [f.id, fundLabel(f)]));
  const fundNameByBubbleId = new Map<string, string>();
  for (const f of holdingFunds) {
    if (f.bubble_id) fundNameByBubbleId.set(f.bubble_id, fundLabel(f));
  }
  const showRoundFund = rounds.some((r) => r.holding_fund_id);

  // sparkERP 회사 개요(주식정보·스파크랩 투자·후속투자) — 매칭된 매물만, 실패해도 무시.
  let erpOverview: ErpCompanyOverview | null = null;
  if (listing.bubble_id) {
    try {
      erpOverview = await getErpCompanyOverview(listing.bubble_id);
    } catch {
      erpOverview = null;
    }
  }

  // 적합도 추천(F7): 조합 mandate 기반 점수 Top N
  const todayStr = new Date().toISOString().slice(0, 10);
  const matches = rankFundsForListing(listing, allFunds, todayStr).slice(
    0,
    MATCH_TOP_N,
  );
  const dealtInvestorIds = ((dealRows ?? []) as { investor_id: string }[]).map(
    (d) => d.investor_id,
  );

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6">
      <Link
        href={backHref}
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
            {listing.company_name_en && (
              <span className="text-base text-muted-foreground">
                {listing.company_name_en}
              </span>
            )}
            <Badge variant={LISTING_STATUS_VARIANT[listing.status]}>
              {LISTING_STATUS_LABEL[listing.status]}
            </Badge>
            {!listing.bubble_id && <ErpUnmatchedNote />}
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
            description="이 매물과 연결된 딜·소속펀드 태그가 모두 함께 삭제됩니다. 되돌릴 수 없습니다."
            action={deleteListing.bind(null, listing.id)}
          />
        </div>
      </div>

      {/* 개요 */}
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
              <dd className="text-foreground">{formatDate(listing.created_at)}</dd>
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

          {/* 소속펀드 */}
          <div className="border-t border-border pt-4">
            <p className="mb-2 text-sm font-medium">소속펀드</p>
            {memberFunds.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                소속펀드가 없습니다. “매물 수정”에서 태그를 추가하세요.
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {memberFunds.map((f) => (
                  <Badge
                    key={f.id}
                    variant="secondary"
                    className="text-sm"
                    title={f.name}
                  >
                    {fundLabel(f)}
                  </Badge>
                ))}
              </div>
            )}
          </div>

          {/* 투자 데이터(EXIT 시나리오 소스) */}
          <div className="border-t border-border pt-4">
            <p className="mb-3 text-sm font-medium">투자 데이터</p>
            {rounds.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                입력된 투자 데이터가 없습니다. “매물 수정”에서 라운드별
                단가·주식수를 입력하거나 sparkERP 투자내역을 불러오세요.
              </p>
            ) : (
              <div className="space-y-3">
                <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3">
                  <div>
                    <dt className="text-xs text-muted-foreground">총 투자원금</dt>
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
                        {showRoundFund && (
                          <th className="px-3 py-2 font-medium">펀드</th>
                        )}
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
                          <td className="px-3 py-2">{r.label || `${i + 1}차`}</td>
                          {showRoundFund && (
                            <td className="px-3 py-2 text-muted-foreground">
                              {(r.holding_fund_id &&
                                fundNameById.get(r.holding_fund_id)) ||
                                "—"}
                            </td>
                          )}
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

      {/* sparkERP 원본 정보 */}
      {erpOverview?.found && (
        <ErpOverview
          overview={erpOverview}
          fundNameByBubbleId={fundNameByBubbleId}
        />
      )}

      {/* 추천 투자사 — 적합도 매칭(F7) */}
      <div className="space-y-3">
        <h2 className="text-base font-semibold tracking-tight">추천 투자사</h2>
        <MatchRecommendations
          listingId={listing.id}
          matches={matches}
          dealtInvestorIds={dealtInvestorIds}
        />
      </div>
    </div>
  );
}
