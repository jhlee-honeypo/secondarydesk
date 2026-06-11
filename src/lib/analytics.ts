// 대시보드/애널리틱스(F11, PRD §5.4·§12.2C) — 기간·운용펀드 필터를 반영해
// 파이프라인 펀넬·핵심 지표·매물별 진척·드랍 분석을 집계한다. 서버 전용.

import { createClient } from "@/lib/supabase/server";
import { DEAL_STAGES, type DealStage } from "@/lib/types";
import { fundLabel } from "@/lib/format";

export type FunnelRow = { stage: DealStage; count: number; amount: number };
export type ListingProgressRow = {
  id: string;
  company_name: string;
  investorCount: number;
  topStage: DealStage | null;
};
export type LostReasonRow = { reason: string; count: number };

export type AnalyticsData = {
  holdingFunds: { id: string; name: string }[];
  activeDealCount: number;
  expectedSum: number;
  avgCycleDays: number | null;
  weekActivityCount: number;
  funnel: FunnelRow[];
  listingProgress: ListingProgressRow[];
  lostReasons: LostReasonRow[];
};

type DealRow = {
  id: string;
  listing_id: string;
  investor_id: string;
  stage: DealStage;
  expected_amount: number | null;
  lost_reason: string | null;
  created_at: string;
  updated_at: string;
  listing: { id: string; company_name: string } | null;
};

type ActivityRow = {
  occurred_at: string;
};

const TERMINAL: DealStage[] = ["클로징", "드랍"];
const stageIndex = (s: DealStage) => DEAL_STAGES.indexOf(s);

function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}
function addDays(base: Date, n: number): Date {
  const d = new Date(base);
  d.setDate(d.getDate() + n);
  return d;
}

export async function loadAnalytics({
  periodDays,
  fundId,
}: {
  periodDays: number | null;
  fundId: string | null;
}): Promise<AnalyticsData> {
  const supabase = await createClient();
  const today = new Date();
  const sinceStr = periodDays ? iso(addDays(today, -periodDays)) : null;
  const weekStr = iso(addDays(today, -7));

  // 운용펀드 필터 대상 매물 id 집합(펀드 선택 시)
  let allowedListings: Set<string> | null = null;
  if (fundId) {
    const { data: lf } = await supabase
      .from("listing_funds")
      .select("listing_id")
      .eq("holding_fund_id", fundId);
    allowedListings = new Set((lf ?? []).map((r) => r.listing_id as string));
  }

  let dealsQuery = supabase
    .from("deals")
    .select(
      "id, listing_id, investor_id, stage, expected_amount, lost_reason, created_at, updated_at, listing:listings(id, company_name)",
    );
  if (sinceStr) dealsQuery = dealsQuery.gte("created_at", sinceStr);

  const [{ data: hf }, dealsRes, actRes] = await Promise.all([
    supabase.from("holding_funds").select("id, name, short_name").order("name"),
    dealsQuery,
    supabase
      .from("activities")
      .select("occurred_at")
      .gte("occurred_at", sinceStr ?? weekStr),
  ]);

  let deals = (dealsRes.data ?? []) as unknown as DealRow[];
  if (allowedListings) {
    deals = deals.filter((d) => allowedListings!.has(d.listing_id));
  }

  // 핵심 지표
  const activeDeals = deals.filter((d) => !TERMINAL.includes(d.stage));
  const activeDealCount = activeDeals.length;
  const expectedSum = activeDeals.reduce(
    (s, d) => s + (d.expected_amount ?? 0),
    0,
  );

  const closed = deals.filter((d) => d.stage === "클로징");
  const avgCycleDays =
    closed.length === 0
      ? null
      : Math.round(
          closed.reduce((s, d) => {
            const days =
              (new Date(d.updated_at).getTime() -
                new Date(d.created_at).getTime()) /
              86_400_000;
            return s + Math.max(0, days);
          }, 0) / closed.length,
        );

  // 파이프라인 펀넬
  const funnel: FunnelRow[] = DEAL_STAGES.map((stage) => {
    const inStage = deals.filter((d) => d.stage === stage);
    return {
      stage,
      count: inStage.length,
      amount: inStage.reduce((s, d) => s + (d.expected_amount ?? 0), 0),
    };
  });

  // 매물별 진척: 노출 투자사 수(=딜 수, unique 제약) + 최고 도달 단계
  const byListing = new Map<string, ListingProgressRow>();
  for (const d of deals) {
    const key = d.listing_id;
    const cur =
      byListing.get(key) ??
      ({
        id: key,
        company_name: d.listing?.company_name ?? "—",
        investorCount: 0,
        topStage: null,
      } satisfies ListingProgressRow);
    cur.investorCount += 1;
    if (cur.topStage === null || stageIndex(d.stage) > stageIndex(cur.topStage)) {
      cur.topStage = d.stage;
    }
    byListing.set(key, cur);
  }
  const listingProgress = [...byListing.values()]
    .sort((a, b) => b.investorCount - a.investorCount)
    .slice(0, 10);

  // 드랍 분석: lost_reason 집계
  const lostMap = new Map<string, number>();
  for (const d of deals.filter((x) => x.stage === "드랍")) {
    const reason = d.lost_reason?.trim() || "(사유 미기재)";
    lostMap.set(reason, (lostMap.get(reason) ?? 0) + 1);
  }
  const lostReasons = [...lostMap.entries()]
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count);

  // 이번주 활동 수
  const activities = (actRes.data ?? []) as unknown as ActivityRow[];
  const weekActivityCount = activities.filter(
    (a) => a.occurred_at.slice(0, 10) >= weekStr,
  ).length;

  return {
    holdingFunds: (
      (hf ?? []) as { id: string; name: string; short_name: string | null }[]
    ).map((f) => ({ id: f.id, name: fundLabel(f) })),
    activeDealCount,
    expectedSum,
    avgCycleDays,
    weekActivityCount,
    funnel,
    listingProgress,
    lostReasons,
  };
}
