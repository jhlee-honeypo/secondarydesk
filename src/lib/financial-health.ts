// 재무 점검 — 추출된 재무제표 원본값으로 파생 지표와 건전성 등급을 계산하는 순수 함수.
// (구글시트 도구의 Test 시트 계산식 재현 + 위험/주의/양호 판정 신설)
//
//   보유현금   = 현금 + 보통예금
//   월평균매출 = 매출(당기) / 보고월
//   월평균판관비 = 판관비 / 보고월
//   월순소모   = 월평균판관비 − 월평균매출   (양수면 매달 현금 소모)
//   런웨이     = 보유현금 / 월순소모          (소모 중일 때만, 개월)
//   자본잠식률 = (자본금 − 자본총계) / 자본금
//   매출성장률 = (매출당기 − 매출전기) / |매출전기|

export type FinancialInput = {
  rev_curr: number;
  ni_curr: number;
  rev_prev: number;
  ni_prev: number;
  cash: number;
  savings: number;
  total_equity: number;
  capital: number;
  sga: number;
  report_month: number; // 3 / 6 / 9 / 12 (월평균 분모)
};

export type FinancialMetrics = {
  heldCash: number; // 보유현금
  monthlyRevenue: number | null; // 월평균매출 (보고월 0이면 null)
  monthlySga: number | null; // 월평균판관비
  monthlyBurn: number | null; // 월순소모 (양수=소모, 음수=흑자)
  runwayMonths: number | null; // 런웨이 (소모 중일 때만, 그 외 null)
  capitalErosion: number | null; // 자본잠식률 (자본금 0이면 null)
  isProfit: boolean; // 당기 흑자 여부
  revenueGrowth: number | null; // 매출성장률 (전기 0이면 null)
};

export type HealthLevel = "danger" | "warning" | "good";

export type HealthResult = {
  level: HealthLevel;
  reasons: string[]; // 판정 근거(사용자 표시용)
};

const RUNWAY_DANGER = 6; // 개월 미만이면 위험
const RUNWAY_WARNING = 12; // 개월 미만이면 주의

export function computeMetrics(i: FinancialInput): FinancialMetrics {
  const heldCash = (i.cash || 0) + (i.savings || 0);
  const m = i.report_month > 0 ? i.report_month : null;

  const monthlyRevenue = m ? i.rev_curr / m : null;
  const monthlySga = m ? i.sga / m : null;
  const monthlyBurn =
    monthlyRevenue !== null && monthlySga !== null
      ? monthlySga - monthlyRevenue
      : null;

  // 소모 중(burn > 0)일 때만 런웨이가 의미 있음. 흑자면 null(=충분/무한).
  const runwayMonths =
    monthlyBurn !== null && monthlyBurn > 0 ? heldCash / monthlyBurn : null;

  const capitalErosion =
    i.capital !== 0 ? (i.capital - i.total_equity) / i.capital : null;

  const revenueGrowth =
    i.rev_prev !== 0 ? (i.rev_curr - i.rev_prev) / Math.abs(i.rev_prev) : null;

  return {
    heldCash,
    monthlyRevenue,
    monthlySga,
    monthlyBurn,
    runwayMonths,
    capitalErosion,
    isProfit: i.ni_curr >= 0,
    revenueGrowth,
  };
}

export function gradeHealth(i: FinancialInput, m: FinancialMetrics): HealthResult {
  const reasons: string[] = [];
  let level: HealthLevel = "good";

  const bump = (next: HealthLevel) => {
    const rank = { good: 0, warning: 1, danger: 2 } as const;
    if (rank[next] > rank[level]) level = next;
  };

  // 1) 자본잠식
  const completeErosion = i.capital !== 0 && i.total_equity <= 0;
  if (completeErosion) {
    bump("danger");
    reasons.push("완전자본잠식 (자본총계 ≤ 0)");
  } else if (m.capitalErosion !== null && m.capitalErosion > 0) {
    bump("warning");
    reasons.push(`부분자본잠식 (잠식률 ${(m.capitalErosion * 100).toFixed(0)}%)`);
  }

  // 2) 런웨이 (적자 소모 중일 때만)
  if (m.runwayMonths !== null) {
    if (m.runwayMonths < RUNWAY_DANGER) {
      bump("danger");
      reasons.push(`런웨이 ${m.runwayMonths.toFixed(1)}개월 (6개월 미만)`);
    } else if (m.runwayMonths < RUNWAY_WARNING) {
      bump("warning");
      reasons.push(`런웨이 ${m.runwayMonths.toFixed(1)}개월 (12개월 미만)`);
    }
  }

  // 3) 적자 / 적자전환
  if (!m.isProfit) {
    bump("warning");
    if (i.ni_prev >= 0 && i.ni_curr < 0) reasons.push("적자전환");
    else reasons.push("당기 적자");
  }

  // 4) 매출 역성장
  if (m.revenueGrowth !== null && m.revenueGrowth < 0) {
    bump("warning");
    reasons.push(`매출 역성장 (${(m.revenueGrowth * 100).toFixed(0)}%)`);
  }

  if (level === "good" && reasons.length === 0) reasons.push("양호");
  return { level, reasons };
}

export const HEALTH_LABEL: Record<HealthLevel, string> = {
  danger: "위험",
  warning: "주의",
  good: "양호",
};
