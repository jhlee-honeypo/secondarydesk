/**
 * SecondaryDesk - 운용조합 드라이파우더(미소진 약정액) 추정 모듈
 *
 * 투자사(GP) 상세 페이지의 "운용 조합" 리스트에서, 조합별 결성일/존속기간만으로
 * 드라이파우더를 추정한다. DIVA 공시 등으로 실제 누적투자집행액을 알게 되면
 * actualInvestedAmount를 채워서 "추정" 대신 "실측"으로 표시할 수 있다.
 *
 * 가정 모델 (선형이 아닌 S커브 + 후속투자 유보 반영):
 * - 투자기간(통상 결성 후 3~4년) 동안은 초반 완만 → 중반 가속 → 후반 둔화로 집행
 * - 투자기간 종료 시점에 결성총액의 약 92%를 소진, 나머지 약 8%만 후속투자용으로 유보
 * - 투자기간 종료 후 ~ 만기까지(관리·회수기간)는 후속투자로 천천히 추가 소진
 * - 곡선의 기준점(아래 두 CURVE 배열)은 업계 통상적 페이싱을 단순화한 값이라,
 *   실제 알고 있는 펀드(예: 자사 운용 펀드)의 실측 집행 곡선으로 교체/보정해서 쓰는 걸 권장
 */

export interface FundDryPowderInput {
  /** 결성총액 (원) */
  commitmentTotal: number;
  /** 결성일(조합 등록일) */
  formationDate: Date | string;
  /** 만기일(존속기간 종료일). termYears가 없을 때 이 값으로 존속기간을 계산 */
  maturityDate?: Date | string;
  /** 존속기간(년). maturityDate가 없을 때 직접 지정 */
  termYears?: number;
  /** 투자기간(년). 미지정 시 termYears - 3 (최소 3년)으로 추정 */
  investmentPeriodYears?: number;
  /** 기준일 (디폴트: 오늘) */
  asOfDate?: Date | string;
  /** 결성연도 시장상황 보정계수. 1.0=표준 페이싱, >1=호황기(더 빠르게 소진), <1=빙하기(더 느리게 소진) */
  vintageSpeedFactor?: number;
  /** 실측 누적투자집행액(원). 알고 있으면 입력 — 있으면 추정 대신 이 값을 우선 사용 */
  actualInvestedAmount?: number;
  /** 실측값 기준일 (참고용, 계산에는 사용하지 않음) */
  actualInvestedAsOf?: Date | string;
}

export interface FundDryPowderResult {
  source: "actual" | "estimated";
  /** 결성 후 경과연수 */
  elapsedYears: number;
  /** 누적투자집행률 (0~1) */
  cumulativeInvestedRatio: number;
  /** 누적투자집행액 (원) */
  cumulativeInvestedAmount: number;
  /** 드라이파우더 (원) = 결성총액 - 누적투자집행액 */
  dryPowderAmount: number;
  /** 드라이파우더 비율 (0~1) */
  dryPowderRatio: number;
  /** 펀드 생애 단계 */
  stage: "ramp-up" | "peak-deployment" | "tail" | "harvest" | "matured";
}

// 투자기간 내 정규화 누적집행률 곡선 [경과비율(0~1), 누적집행률(0~1)]
// 초반 완만(1년차 ~13%) → 중반 가속 → 종료 시 약 92%(대부분 소진, 나머지 8%만 유보).
const INVESTMENT_PERIOD_CURVE: [number, number][] = [
  [0.0, 0.0],
  [0.25, 0.13],
  [0.5, 0.44],
  [0.75, 0.72],
  [1.0, 0.92],
];

// 투자기간 종료 후 ~ 만기까지 정규화 누적집행률 곡선 [구간경과비율(0~1), 누적집행률(0~1)]
// 남은 약 8%가 만기까지 천천히 소진.
const HARVEST_PERIOD_CURVE: [number, number][] = [
  [0.0, 0.92],
  [0.33, 0.95],
  [0.67, 0.98],
  [1.0, 1.0],
];

function interpolate(curve: [number, number][], x: number): number {
  const clamped = Math.min(1, Math.max(0, x));
  for (let i = 0; i < curve.length - 1; i++) {
    const [x0, y0] = curve[i];
    const [x1, y1] = curve[i + 1];
    if (clamped >= x0 && clamped <= x1) {
      const t = (clamped - x0) / (x1 - x0);
      return y0 + t * (y1 - y0);
    }
  }
  return curve[curve.length - 1][1];
}

function toDate(d: Date | string): Date {
  return d instanceof Date ? d : new Date(d);
}

function yearsBetween(start: Date, end: Date): number {
  return (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24 * 365.25);
}

// 투자기간(년) = 존속 − 3, 단 최소 3년·최대 5년. (긴 펀드의 투자기간 과대추정 방지)
function clampInvestmentPeriod(termYears: number): number {
  return Math.min(5, Math.max(3, termYears - 3));
}

// 경과연수 → 누적집행률·생애단계 (estimateDryPowder 와 곡선 샘플링이 공유하는 단일 로직)
function deploymentAt(
  elapsedYears: number,
  termYears: number,
  investmentPeriodYears: number,
): { ratio: number; stage: FundDryPowderResult["stage"] } {
  if (elapsedYears >= termYears) {
    return { ratio: interpolate(HARVEST_PERIOD_CURVE, 1), stage: "matured" };
  }
  if (elapsedYears <= investmentPeriodYears) {
    const x = elapsedYears / investmentPeriodYears;
    return {
      ratio: interpolate(INVESTMENT_PERIOD_CURVE, x),
      stage: x < 0.5 ? "ramp-up" : x < 0.85 ? "peak-deployment" : "tail",
    };
  }
  const harvestSpan = Math.max(0.01, termYears - investmentPeriodYears);
  const y = (elapsedYears - investmentPeriodYears) / harvestSpan;
  return { ratio: interpolate(HARVEST_PERIOD_CURVE, y), stage: "harvest" };
}

export function estimateDryPowder(input: FundDryPowderInput): FundDryPowderResult {
  const formationDate = toDate(input.formationDate);
  const asOfDate = toDate(input.asOfDate ?? new Date());
  const elapsedYears = Math.max(0, yearsBetween(formationDate, asOfDate));

  const termYears =
    input.termYears ??
    (input.maturityDate ? yearsBetween(formationDate, toDate(input.maturityDate)) : 7);

  const investmentPeriodYears =
    input.investmentPeriodYears ?? clampInvestmentPeriod(termYears);
  const vintageSpeedFactor = input.vintageSpeedFactor ?? 1.0;
  const adjustedElapsedYears = elapsedYears * vintageSpeedFactor;

  const deployment = deploymentAt(
    adjustedElapsedYears,
    termYears,
    investmentPeriodYears,
  );
  let cumulativeInvestedRatio = deployment.ratio;
  const stage = deployment.stage;

  let source: FundDryPowderResult["source"] = "estimated";
  let cumulativeInvestedAmount = input.commitmentTotal * cumulativeInvestedRatio;

  if (input.actualInvestedAmount !== undefined) {
    source = "actual";
    cumulativeInvestedAmount = input.actualInvestedAmount;
    cumulativeInvestedRatio =
      input.commitmentTotal > 0 ? cumulativeInvestedAmount / input.commitmentTotal : 0;
  }

  const dryPowderAmount = Math.max(0, input.commitmentTotal - cumulativeInvestedAmount);
  const dryPowderRatio = input.commitmentTotal > 0 ? dryPowderAmount / input.commitmentTotal : 0;

  return {
    source,
    elapsedYears: Math.round(elapsedYears * 10) / 10,
    cumulativeInvestedRatio: Math.round(cumulativeInvestedRatio * 1000) / 1000,
    cumulativeInvestedAmount: Math.round(cumulativeInvestedAmount),
    dryPowderAmount: Math.round(dryPowderAmount),
    dryPowderRatio: Math.round(dryPowderRatio * 1000) / 1000,
    stage,
  };
}

/** 원 단위 금액을 "OOO.O억원" 형태 문자열로 변환 (UI 표시용) */
export function formatToEokWon(amountWon: number): string {
  const eok = amountWon / 100_000_000;
  return `${eok.toLocaleString("ko-KR", { maximumFractionDigits: 1 })}억원`;
}

/**
 * 표준 가정으로 연차별 집행률(결성총액 대비)을 샘플링 (설명 툴팁 선그래프용).
 * 반환: { year: 연차(1~), deployed: 해당 연차 집행률, cumulative: 누적집행률 }[]
 */
export function sampleAnnualDeployment(
  termYears = 7,
  investmentPeriodYears = clampInvestmentPeriod(termYears),
): { year: number; deployed: number; cumulative: number }[] {
  const out: { year: number; deployed: number; cumulative: number }[] = [];
  let prev = 0;
  const lastYear = Math.ceil(termYears);
  for (let y = 1; y <= lastYear; y++) {
    const cumulative = deploymentAt(
      Math.min(y, termYears),
      termYears,
      investmentPeriodYears,
    ).ratio;
    out.push({ year: y, deployed: Math.max(0, cumulative - prev), cumulative });
    prev = cumulative;
  }
  return out;
}

/** 설명 툴팁/그래프가 참조하는 표준 가정값 */
export const DRY_POWDER_ASSUMPTIONS = {
  termYears: 7,
  investmentPeriodYears: clampInvestmentPeriod(7), // = min(5, max(3, term−3)) = 4
  reserveAtInvestmentEnd: 0.08, // 투자기간 종료 시 후속투자 유보 ≈ 8%
} as const;
