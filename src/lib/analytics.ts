// 대시보드/애널리틱스(F11, PRD §5.4·§12.2C) — 기간·운용펀드 필터를 반영해
// 파이프라인 펀넬·핵심 지표·매물별/투자사별 진척·정체 딜·드랍 분석을 집계한다.
// 서버 전용.

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
export type InvestorProgressRow = {
  id: string;
  name: string;
  listingCount: number;
  topStage: DealStage | null;
};
export type StaleDealRow = {
  id: string;
  listingName: string;
  investorName: string;
  stage: DealStage;
  days: number;
  sinceStr: string;
};
export type LostReasonRow = { reason: string; count: number };

export type AnalyticsData = {
  holdingFunds: { id: string; name: string }[];
  activeDealCount: number;
  contactedInvestorCount: number;
  closedCount: number;
  exposedListingCount: number;
  totalListingCount: number;
  funnel: FunnelRow[];
  listingProgress: ListingProgressRow[];
  investorProgress: InvestorProgressRow[];
  staleDeals: StaleDealRow[];
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
  investor: { id: string; name: string } | null;
  stage_events: { stage: DealStage; changed_at: string }[] | null;
};

const TERMINAL: DealStage[] = ["클로징", "드랍"];
const stageIndex = (s: DealStage) => DEAL_STAGES.indexOf(s);

// 정체(장기 미진척) 기준: 현재 단계 진입 후 이 일수 이상 움직임이 없는 비종료 딜.
const STALE_DAYS = 30;

function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}
function addDays(base: Date, n: number): Date {
  const d = new Date(base);
  d.setDate(d.getDate() + n);
  return d;
}

// 현재 단계에 진입한 일시 — 현재 단계와 같은 단계 이력 중 가장 최근 changed_at.
function currentStageEntry(d: DealRow): string {
  let latest = "";
  for (const ev of d.stage_events ?? []) {
    if (ev.stage === d.stage && ev.changed_at > latest) latest = ev.changed_at;
  }
  return latest;
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
      "id, listing_id, investor_id, stage, expected_amount, lost_reason, created_at, updated_at, listing:listings(id, company_name), investor:investors(id, name), stage_events:deal_stage_events(stage, changed_at)",
    );
  if (sinceStr) dealsQuery = dealsQuery.gte("created_at", sinceStr);

  const [{ data: hf }, dealsRes, listingCountRes] = await Promise.all([
    supabase.from("holding_funds").select("id, name, short_name").order("name"),
    dealsQuery,
    supabase.from("listings").select("id", { count: "exact", head: true }),
  ]);

  let deals = (dealsRes.data ?? []) as unknown as DealRow[];
  if (allowedListings) {
    deals = deals.filter((d) => allowedListings!.has(d.listing_id));
  }

  // 핵심 지표
  const activeDeals = deals.filter((d) => !TERMINAL.includes(d.stage));
  const activeDealCount = activeDeals.length;
  const closedCount = deals.filter((d) => d.stage === "클로징").length;
  const contactedInvestorCount = new Set(deals.map((d) => d.investor_id)).size;
  const exposedListingCount = new Set(deals.map((d) => d.listing_id)).size;
  // 노출 대비 모수: 펀드 선택 시 그 조합의 포트폴리오 기업 수, 아니면 전체 매물 수.
  const totalListingCount = allowedListings
    ? allowedListings.size
    : (listingCountRes.count ?? 0);

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

  // 투자사별 진척: 컨택한 매물 수 + 최고 도달 단계(매물별 진척의 투자사 버전)
  const byInvestor = new Map<string, InvestorProgressRow>();
  for (const d of deals) {
    const key = d.investor_id;
    const cur =
      byInvestor.get(key) ??
      ({
        id: key,
        name: d.investor?.name ?? "—",
        listingCount: 0,
        topStage: null,
      } satisfies InvestorProgressRow);
    cur.listingCount += 1;
    if (cur.topStage === null || stageIndex(d.stage) > stageIndex(cur.topStage)) {
      cur.topStage = d.stage;
    }
    byInvestor.set(key, cur);
  }
  const investorProgress = [...byInvestor.values()]
    .sort((a, b) => b.listingCount - a.listingCount)
    .slice(0, 10);

  // 정체 딜: 비종료 단계에서 현재 단계 진입 후 STALE_DAYS 이상 멈춘 딜(오래된 순)
  const todayMs = today.getTime();
  const staleDeals: StaleDealRow[] = activeDeals
    .map((d) => {
      const entry = currentStageEntry(d);
      if (!entry) return null;
      const days = Math.floor((todayMs - new Date(entry).getTime()) / 86_400_000);
      if (days < STALE_DAYS) return null;
      return {
        id: d.id,
        listingName: d.listing?.company_name ?? "—",
        investorName: d.investor?.name ?? "—",
        stage: d.stage,
        days,
        sinceStr: entry.slice(0, 10),
      } satisfies StaleDealRow;
    })
    .filter((x): x is StaleDealRow => x !== null)
    .sort((a, b) => b.days - a.days)
    .slice(0, 8);

  // 드랍 분석: lost_reason 집계
  const lostMap = new Map<string, number>();
  for (const d of deals.filter((x) => x.stage === "드랍")) {
    const reason = d.lost_reason?.trim() || "(사유 미기재)";
    lostMap.set(reason, (lostMap.get(reason) ?? 0) + 1);
  }
  const lostReasons = [...lostMap.entries()]
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count);

  return {
    holdingFunds: (
      (hf ?? []) as { id: string; name: string; short_name: string | null }[]
    ).map((f) => ({ id: f.id, name: fundLabel(f) })),
    activeDealCount,
    contactedInvestorCount,
    closedCount,
    exposedListingCount,
    totalListingCount,
    funnel,
    listingProgress,
    investorProgress,
    staleDeals,
    lostReasons,
  };
}
