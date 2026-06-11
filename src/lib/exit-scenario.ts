// EXIT 시나리오 계산 — 매물별 투자 라운드로부터 합계·손익분기·할인율 프로젝션을
// 도출하는 순수 함수. UI/DB와 분리되어 단독 테스트·재사용 가능.

/** 프로젝션 할인율 구간 (0% ~ 40%, 5%씩). */
export const DISCOUNT_RATES = [0, 0.05, 0.1, 0.15, 0.2, 0.25, 0.3, 0.35, 0.4];

export type RoundInput = {
  amount: number; // 투자액(원)
  unitPrice: number; // 투자 단가(원/주)
  shares: number; // 보유 주식수
};

export type ScenarioTotals = {
  totalPrincipal: number; // 총 투자원금 = Σ투자액
  totalShares: number; // 총 보유 주식수 = Σ주식수
  avgUnitPrice: number; // 가중평균 취득단가 = 원금 / 주식수
  baseUnitPrice: number; // 기준단가 = 최종(마지막) 라운드 단가
  currentValue: number; // 현재 예상가치 = 기준단가 × 총주식수
  breakevenPrice: number; // 손익분기 단가 = 원금 / 주식수 (= 가중평균단가)
  breakevenDiscount: number; // 손익분기 할인율 = 1 - 손익분기단가 / 기준단가
};

export type ProjectionRow = {
  discount: number; // 0 ~ 0.4
  salePrice: number; // 매각 단가 = 기준단가 × (1 - 할인율)
  saleTotal: number; // 매각 총액 = 매각단가 × 총주식수
  pnl: number; // 손익 = 매각총액 - 원금
  mom: number; // 수익률(MoM) = 매각총액 / 원금
  isProfit: boolean; // 손익 >= 0
  isBreakevenNearest: boolean; // 손익분기 할인율에 가장 근접한 행
};

export function computeTotals(rounds: RoundInput[]): ScenarioTotals {
  const totalPrincipal = rounds.reduce((s, r) => s + (r.amount || 0), 0);
  const totalShares = rounds.reduce((s, r) => s + (r.shares || 0), 0);
  // 기준단가: 마지막(최종) 라운드의 단가. 라운드가 없으면 0.
  const last = rounds[rounds.length - 1];
  const baseUnitPrice = last?.unitPrice || 0;

  const avgUnitPrice = totalShares > 0 ? totalPrincipal / totalShares : 0;
  const breakevenPrice = avgUnitPrice;
  const breakevenDiscount =
    baseUnitPrice > 0 ? 1 - breakevenPrice / baseUnitPrice : 0;

  return {
    totalPrincipal,
    totalShares,
    avgUnitPrice,
    baseUnitPrice,
    currentValue: baseUnitPrice * totalShares,
    breakevenPrice,
    breakevenDiscount,
  };
}

export function computeProjection(totals: ScenarioTotals): ProjectionRow[] {
  const { baseUnitPrice, totalShares, totalPrincipal, breakevenDiscount } =
    totals;

  // 손익분기 할인율에 가장 근접한 구간 1개를 강조 대상으로 선정.
  // (손익분기 할인율이 0~40% 범위를 벗어나면 강조 없음)
  let nearestIdx = -1;
  if (breakevenDiscount >= 0 && breakevenDiscount <= 0.4) {
    let best = Infinity;
    DISCOUNT_RATES.forEach((d, i) => {
      const diff = Math.abs(d - breakevenDiscount);
      if (diff < best) {
        best = diff;
        nearestIdx = i;
      }
    });
  }

  return DISCOUNT_RATES.map((discount, i) => {
    const salePrice = baseUnitPrice * (1 - discount);
    const saleTotal = salePrice * totalShares;
    const pnl = saleTotal - totalPrincipal;
    const mom = totalPrincipal > 0 ? saleTotal / totalPrincipal : 0;
    return {
      discount,
      salePrice,
      saleTotal,
      pnl,
      mom,
      isProfit: pnl >= 0,
      isBreakevenNearest: i === nearestIdx,
    };
  });
}
