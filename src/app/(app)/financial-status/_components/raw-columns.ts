// 재무 추출 현황(raw) 표의 열 정의 — 화면 표와 CSV 내려받기가 이 한 곳을 같이 쓴다.
// 한쪽에만 열을 추가하면 "화면에는 있는데 파일에는 없는" 항목이 생기므로 분리하지 않는다.
//
// 담는 것은 financial_statements 에 저장된 값 그대로다(파생 지표 없음).
// 런웨이·자본잠식률 같은 계산값은 /financials(재무 점검) 탭의 몫이고,
// 여기서는 건전성·정합만 추출 품질 점검용으로 표 오른쪽 끝에 따로 붙인다.
import type { FinancialStatement } from "@/lib/types";

export type RawCol = {
  label: string;
  /** money = 통화 금액(천단위 콤마) · int = 개수 · text = 문자열 */
  kind: "money" | "int" | "text";
  get: (f: FinancialStatement) => number | string | null;
  /** 머리글 툴팁 — 원본 재무제표의 어느 계정과목에서 뽑은 값인지 */
  title?: string;
};

export type RawGroup = { label: string; cols: RawCol[] };

export const RAW_GROUPS: RawGroup[] = [
  {
    label: "손익계산서",
    cols: [
      { label: "매출(당기)", kind: "money", get: (f) => f.rev_curr, title: "매출액 당기 (누적)" },
      { label: "매출(전기)", kind: "money", get: (f) => f.rev_prev, title: "매출액 전기 — 대개 전년 연간 매출" },
      { label: "매출원가", kind: "money", get: (f) => f.cogs, title: "매출원가 — 없는 문서(SW기업 등)는 0" },
      { label: "판관비", kind: "money", get: (f) => f.sga, title: "판매비와관리비" },
      { label: "영업이익", kind: "money", get: (f) => f.operating_income, title: "영업이익/영업손실 — 손실은 음수" },
      { label: "순이익(당기)", kind: "money", get: (f) => f.ni_curr, title: "당기순이익/당기순손실 — 손실은 음수" },
      { label: "순이익(전기)", kind: "money", get: (f) => f.ni_prev, title: "전기 당기순이익" },
    ],
  },
  {
    label: "재무상태표",
    cols: [
      { label: "현금", kind: "money", get: (f) => f.cash, title: "현금및현금성자산 중 현금 — 예금과 합치면 총액" },
      { label: "예금", kind: "money", get: (f) => f.savings, title: "보통예금 등 예금성 자산" },
      { label: "유동자산", kind: "money", get: (f) => f.current_assets },
      { label: "유동부채", kind: "money", get: (f) => f.current_liabilities },
      { label: "자산총계", kind: "money", get: (f) => f.total_assets },
      { label: "부채총계", kind: "money", get: (f) => f.total_liabilities },
      { label: "자본총계", kind: "money", get: (f) => f.total_equity },
      { label: "자본금", kind: "money", get: (f) => f.capital },
      { label: "이익잉여금", kind: "money", get: (f) => f.retained_earnings, title: "이익잉여금/결손금 — 결손은 음수" },
    ],
  },
  {
    // 재무제표에서 추출한 값이 아니라 slab 분기보고 입력값이 그대로 실려 온 것.
    // 원천이 달라 추출값과 어긋날 수 있어 별도 그룹으로 떼어 둔다.
    label: "분기보고 기입값(추출 아님)",
    cols: [
      { label: "직원수", kind: "int", get: (f) => f.head_count },
      { label: "투자유치", kind: "text", get: (f) => f.funding_round },
      { label: "시리즈", kind: "text", get: (f) => f.funding_series },
      { label: "누적투자", kind: "money", get: (f) => f.total_raised },
      { label: "사업 하이라이트", kind: "text", get: (f) => f.business_highlight },
    ],
  },
];

export const RAW_COLS: RawCol[] = RAW_GROUPS.flatMap((g) => g.cols);
