// PRD §4 스키마에 대응하는 TypeScript 타입과 enum 옵션 상수.
// Supabase 타입 자동생성을 도입하기 전까지의 단일 출처.

export type InvestorType =
  | "VC"
  | "CVC"
  | "PEF"
  | "AC"
  | "자산운용"
  | "증권사"
  | "패밀리오피스"
  | "기타";

export type InvestorTier = "A" | "B" | "C";

export type SecondaryAppetite = "적극" | "가능" | "불가" | "미상";

export const INVESTOR_TYPES: InvestorType[] = [
  "VC",
  "CVC",
  "PEF",
  "AC",
  "자산운용",
  "증권사",
  "패밀리오피스",
  "기타",
];

export const INVESTOR_TIERS: InvestorTier[] = ["A", "B", "C"];

export const SECONDARY_APPETITES: SecondaryAppetite[] = [
  "적극",
  "가능",
  "불가",
  "미상",
];

// 조합 mandate 입력 보조용(자유 입력도 허용하되, 칩 추천 후보로 사용)
export const STAGE_FOCUS_OPTIONS = [
  "Seed",
  "Pre-A",
  "Series A",
  "B+",
  "Growth",
  "Secondary",
];

export type UserRow = {
  id: string;
  name: string | null;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  role: "member" | "lead";
};

export type Investor = {
  id: string;
  name: string;
  type: InvestorType | null;
  tier: InvestorTier | null;
  website: string | null;
  description: string | null;
  met_date: string | null;
  owner_id: string | null;
  created_at: string;
  updated_at: string;
};

export type Fund = {
  id: string;
  investor_id: string;
  name: string;
  vintage: number | null;
  aum: number | null;
  dry_powder: number | null;
  main_purpose: string | null;
  stage_focus: string[] | null;
  sector_focus: string[] | null;
  maturity_date: string | null;
  check_size_min: number | null;
  check_size_max: number | null;
  secondary_appetite: SecondaryAppetite | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type Contact = {
  id: string;
  investor_id: string;
  name: string;
  title: string | null;
  is_decision_maker: boolean;
  email: string | null;
  phone: string | null;
  notes: string | null;
  last_contacted_at: string | null;
  created_at: string;
  updated_at: string;
};

// 담당자 이름 조인을 포함한 투자사 목록 행
export type InvestorWithOwner = Investor & {
  owner: { name: string | null; email: string | null } | null;
};

// 매물 섹터 분류 선택지(필터링 일관성을 위해 자유 입력 대신 고정 목록 사용)
export const SECTOR_OPTIONS = [
  "광고/마케팅",
  "금융/보험/핀테크",
  "모빌리티/교통",
  "부동산/건설",
  "AI/딥테크/블록체인",
  "여행/레저",
  "인사/비즈니스/법률",
  "커머스",
  "통신/보안/데이터",
  "푸드/농업",
  "홈리빙/펫",
  "피트니스/스포츠",
  "교육",
  "게임",
  "물류",
  "뷰티/화장품",
  "소셜미디어/커뮤니티",
  "유아/출산",
  "제조/하드웨어",
  "콘텐츠/예술",
  "패션",
  "환경/에너지",
  "헬스케어/바이오",
  "기타",
];

// §4.4 Listing.status — LIVE(운영 중) / ON SALE(매각 진행·가능) / EXIT(엑싯 완료) / W/O(상각)
export type ListingStatus = "LIVE" | "ON SALE" | "EXIT" | "W/O";

export const LISTING_STATUSES: ListingStatus[] = [
  "LIVE",
  "ON SALE",
  "EXIT",
  "W/O",
];

// 폼/필터에서 선택 가능한 상태 — 4개 모두 선택 가능.
export const SELECTABLE_LISTING_STATUSES: ListingStatus[] = LISTING_STATUSES;

// 화면 표시용 라벨(현재는 저장값과 동일한 영문 라벨).
export const LISTING_STATUS_LABEL: Record<ListingStatus, string> = {
  LIVE: "LIVE",
  "ON SALE": "ON SALE",
  EXIT: "EXIT",
  "W/O": "W/O",
};

// §4.5 HoldingFund.status (마이그레이션 20260609000002 로 enum 재정의됨)
export type HoldingFundStatus = "운용 중" | "청산 준비" | "만기 연장" | "청산 완료";

export const HOLDING_FUND_STATUSES: HoldingFundStatus[] = [
  "운용 중",
  "청산 준비",
  "만기 연장",
  "청산 완료",
];

// §4.4 Listing (매물/구주) — 우리가 파는 측(회사 단위)
export type Listing = {
  id: string;
  company_name: string;
  status: ListingStatus;
  sector: string | null;
  stage: string | null;
  asking_valuation: number | null;
  latest_round_price: number | null; // 최신(후속) 라운드 단가(원/주) — EXIT 기준
  summary: string | null;
  deck_url: string | null;
  created_at: string;
  updated_at: string;
};

// §4.5 HoldingFund (운용펀드) — 우리가 운용·매각하는 펀드
export type HoldingFund = {
  id: string;
  name: string;
  short_name: string | null; // 약칭 — 화면 표시용(없으면 name 폴백)
  vintage: number | null;
  maturity_date: string | null;
  status: HoldingFundStatus | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

// §4.6 ListingFund 태그 조인 임베드 (매물 → 소속 운용펀드)
export type ListingWithFunds = Listing & {
  listing_funds: {
    holding_fund_id: string;
    holding_funds: { id: string; name: string; short_name: string | null } | null;
  }[];
};

export const LISTING_STATUS_VARIANT: Record<
  ListingStatus,
  "default" | "secondary" | "destructive" | "outline"
> = {
  LIVE: "outline",
  "ON SALE": "default",
  EXIT: "secondary",
  "W/O": "destructive",
};

export const HOLDING_FUND_STATUS_VARIANT: Record<
  HoldingFundStatus,
  "default" | "secondary" | "destructive" | "outline"
> = {
  "운용 중": "default",
  "청산 준비": "secondary",
  "만기 연장": "destructive",
  "청산 완료": "outline",
};

export const SECONDARY_APPETITE_VARIANT: Record<
  SecondaryAppetite,
  "default" | "secondary" | "destructive" | "outline"
> = {
  적극: "default",
  가능: "secondary",
  불가: "destructive",
  미상: "outline",
};

// §4.7 Deal.stage — 선언 순서 = 파이프라인 순서(칸반 컬럼 순서)
// 마이그레이션 20260610000000 로 5단계로 축소됨.
export type DealStage = "컨택" | "기업소개" | "IR·실사" | "클로징" | "드랍";

export const DEAL_STAGES: DealStage[] = [
  "컨택",
  "기업소개",
  "IR·실사",
  "클로징",
  "드랍",
];

// §4.7 Deal (딜) — 매물 × 투자사 교차점
export type Deal = {
  id: string;
  listing_id: string;
  investor_id: string;
  fund_id: string | null;
  owner_id: string;
  stage: DealStage;
  intro_path: string | null;
  intro_source: string | null;
  intro_relationship: string | null;
  intro_date: string | null;
  expected_amount: number | null;
  probability: number | null;
  next_action: string | null;
  next_action_date: string | null;
  target_close_date: string | null;
  lost_reason: string | null;
  created_at: string;
  updated_at: string;
};

// 딜 단계 진입 이력 1건 (카드 미니 타임라인용)
export type DealStageEvent = {
  stage: DealStage;
  changed_at: string;
};

// 칸반 카드/목록용 — 매물·투자사·담당자 이름 + 단계 이력 조인 임베드
export type DealCard = Deal & {
  listing: { id: string; company_name: string } | null;
  investor: { id: string; name: string } | null;
  owner: {
    id: string;
    name: string | null;
    email: string | null;
    first_name: string | null;
  } | null;
  stage_events: DealStageEvent[];
};

// EXIT 시나리오용 매물별 투자 라운드
export type ExitScenarioRound = {
  id: string;
  listing_id: string;
  round_no: number;
  label: string | null;
  amount: number;
  unit_price: number;
  shares: number;
  holding_fund_id: string | null;
};

// §4.8 Activity.type
export type ActivityType =
  | "미팅"
  | "통화"
  | "이메일"
  | "메신저"
  | "자료발송"
  | "IR"
  | "노트";

export const ACTIVITY_TYPES: ActivityType[] = [
  "미팅",
  "통화",
  "이메일",
  "메신저",
  "자료발송",
  "IR",
  "노트",
];

// §4.8 Activity (활동/타임라인)
export type Activity = {
  id: string;
  deal_id: string | null;
  investor_id: string;
  contact_id: string | null;
  type: ActivityType;
  occurred_at: string;
  content: string;
  author_id: string;
  attachment_url: string | null;
  created_at: string;
};

// 타임라인 표시용 — 작성자·컨택·연결 딜(매물명) 조인 임베드
export type ActivityCard = Activity & {
  author: { name: string | null; email: string | null } | null;
  contact: { name: string } | null;
  deal: { id: string; listing: { company_name: string } | null } | null;
};

// 단계별 배지/컬럼 강조 색상 (클로징=성사, 드랍=중단)
export const DEAL_STAGE_VARIANT: Record<
  DealStage,
  "default" | "secondary" | "destructive" | "outline"
> = {
  컨택: "outline",
  기업소개: "secondary",
  "IR·실사": "secondary",
  클로징: "default",
  드랍: "destructive",
};
