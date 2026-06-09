// 적합도 매칭(F7, PRD §6.5) — 매물 1건과 조합(Fund) mandate 의 룰 기반 점수.
// 순수 함수: 서버 컴포넌트에서 계산해 Top N 추천에 사용한다.

import type { Fund, Listing } from "@/lib/types";

export type FundWithInvestor = Fund & {
  investor: { id: string; name: string } | null;
};

export type MatchReason = { label: string; delta: number };

export type MatchResult = {
  fund: FundWithInvestor;
  score: number;
  reasons: MatchReason[];
};

// 가중치(예시값, PRD §6.5 기준). 양수=적합 신호, 음수=부적합 신호.
const W = {
  stage: 30,
  sector: 30,
  dryPowder: 25,
  appetite: { 적극: 20, 가능: 10, 미상: 0, 불가: -30 } as const,
  maturityImminent: -15,
};

// 만기 임박 기준: 잔여 운용기간 12개월 미만
const MATURITY_IMMINENT_DAYS = 365;

function daysUntil(dateStr: string, todayStr: string): number {
  const d = new Date(dateStr).getTime();
  const t = new Date(todayStr).getTime();
  return Math.round((d - t) / 86_400_000);
}

/** 매물 한 건에 대한 단일 조합의 적합도 점수와 근거를 산출. */
export function scoreFundForListing(
  listing: Listing,
  fund: FundWithInvestor,
  todayStr: string,
): MatchResult {
  const reasons: MatchReason[] = [];

  // 투자단계 일치
  if (listing.stage && fund.stage_focus?.includes(listing.stage)) {
    reasons.push({ label: `단계 일치(${listing.stage})`, delta: W.stage });
  }

  // 섹터 일치
  if (listing.sector && fund.sector_focus?.includes(listing.sector)) {
    reasons.push({ label: `섹터 일치(${listing.sector})`, delta: W.sector });
  }

  // 드라이파우더가 희망 매각 밸류 이상
  if (
    listing.asking_valuation != null &&
    fund.dry_powder != null &&
    fund.dry_powder >= listing.asking_valuation
  ) {
    reasons.push({ label: "드라이파우더 충분", delta: W.dryPowder });
  }

  // 구주 인수 선호도
  if (fund.secondary_appetite) {
    const delta = W.appetite[fund.secondary_appetite];
    if (delta !== 0) {
      reasons.push({ label: `구주 ${fund.secondary_appetite}`, delta });
    }
  }

  // 만기 임박(잔여 운용기간 부족)
  if (fund.maturity_date) {
    const left = daysUntil(fund.maturity_date, todayStr);
    if (left < MATURITY_IMMINENT_DAYS) {
      reasons.push({ label: "조합 만기 임박", delta: W.maturityImminent });
    }
  }

  const score = reasons.reduce((sum, r) => sum + r.delta, 0);
  return { fund, score, reasons };
}

/** 등록된 조합들에 대해 점수를 매기고 내림차순 정렬. */
export function rankFundsForListing(
  listing: Listing,
  funds: FundWithInvestor[],
  todayStr: string,
): MatchResult[] {
  return funds
    .map((f) => scoreFundForListing(listing, f, todayStr))
    .sort((a, b) => b.score - a.score);
}
