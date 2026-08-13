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
  diva_oper_inst_id: string | null; // DIVA 운용사ID — 임포트 식별 키
  created_at: string;
  updated_at: string;
};

export type Fund = {
  id: string;
  investor_id: string;
  name: string;
  vintage: number | null;
  formation_date: string | null; // 결성일(일단위). vintage 는 이 값의 연도로 도출
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
  diva_asct_id: string | null; // DIVA 조합ID — 임포트 멱등 키
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

// 명함 백데이터(검색용) — 투자사/컨택 자동생성 안 함
export type BusinessCard = {
  id: string;
  name: string;
  company: string | null;
  title: string | null;
  email: string | null;
  phone: string | null;
  met_date: string | null;
  notes: string | null;
  created_at: string;
};

// 담당자 이름 조인을 포함한 투자사 목록 행
export type InvestorWithOwner = Investor & {
  owner: { name: string | null; email: string | null } | null;
};

// 매물 섹터 분류 선택지 — sparkERP(slab) 섹터 택소노미와 1:1 일치(영문 원문).
// slab 동기화 매물은 이 값이 그대로 저장되고, 미매칭 신규 매물도 같은 목록에서 선택한다.
export const SECTOR_OPTIONS = [
  "eCommerce/Marketplace",
  "Entertainment/Media/Sports",
  "Data Analytics",
  "Software as a Service(SaaS)",
  "Healthcare/Medicaltech",
  "A.I./Artificial Intelligence",
  "Fashion/Design",
  "Transportation/Logistics/Supply Chain",
  "Foodtech",
  "Financial Services/Fintech",
  "Human Resource/HRtech",
  "Advertising/Adtech",
  "AR/VR",
  "Education/Edutech",
  "Cybersecurity",
  "Pharmaceutical",
  "Gaming/eSports",
  "Real Estate/Proptech",
  "Agriculture/Agritech",
  "Cleantech/ESG/Sustainability",
  "Travel/Hospitality",
  "Life Science",
  "Energy",
  "Communication/Telecom",
  "Communication",
  "Beauty/Skincare",
  "Social Media/SNS",
  "Mobile Apps",
  "Others",
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

// §4.6 ListingFund.position_status — 그 펀드가 그 매물을 취급하는 상태.
// slab sparklabinvestment."investment status" 동기화값이라 영업값 ON SALE 은 없다.
// ListingStatus 의 부분집합이므로 라벨·배지 색은 LISTING_STATUS_* 를 함께 쓴다.
export type PositionStatus = "LIVE" | "EXIT" | "W/O";

// 분기별 회수 전략 그룹(listing_quarter_groups) — 재무 점검 탭에서 사람이 기입한다.
// '-' 는 EXIT·상각처럼 A/B/C 판단 대상이 아닌 기업 표시 — 공란(미기입)과 다르다.
export type ListingGroupCode = "A" | "B" | "C" | "-";

export const LISTING_GROUP_CODES: ListingGroupCode[] = ["A", "B", "C", "-"];

export const LISTING_GROUP_LABEL: Record<ListingGroupCode, string> = {
  A: "즉시 회수 및 조기 배분 유력 자산",
  B: "전략적 회수 가치 극대화 자산",
  C: "리스크 관리 및 자산 효율화 자산",
  "-": "해당 없음 (EXIT·상각 등 판단 대상 아님)",
};

// 좁은 칸(필터 버튼·툴팁)용 축약 라벨.
export const LISTING_GROUP_SHORT: Record<ListingGroupCode, string> = {
  A: "즉시 회수",
  B: "가치 극대화",
  C: "리스크 관리",
  "-": "해당 없음",
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
  company_name_en: string | null; // 영문 회사명 (Bubble company.company name eng 연동)
  bubble_id: string | null; // ERP company._id — 제자리 동기화 멱등 키
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
  commitment: number | null; // 약정액(원) — Bubble fund.fund size 연동
  bubble_id: string | null; // ERP fund._id — 일괄 동기화 멱등 키
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
  changed_by: string | null;
  // 단계를 옮긴 사람(공동작업 시 "누가 옮겼는지" 표시용). 조인 실패 시 null.
  mover: { name: string | null; first_name: string | null } | null;
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

// 재무 점검 — 재무제표 분기 행 (financial_statements 테이블)
export type FinancialStatement = {
  id: string;
  company_name: string;
  company_name_en: string | null;
  bubble_company_id: string | null;
  report_year: number;
  report_month: number; // 3/6/9/12
  rev_curr: number;
  ni_curr: number;
  rev_prev: number;
  ni_prev: number;
  cash: number;
  savings: number;
  total_equity: number;
  capital: number;
  sga: number;
  // Phase 1 확장 지표 (재추출 전 행/미포함 문서는 null)
  cogs: number | null;
  operating_income: number | null;
  current_assets: number | null;
  current_liabilities: number | null;
  total_assets: number | null;
  total_liabilities: number | null;
  retained_earnings: number | null;
  source: "upload" | "slab";
  source_file: string | null;
  source_file_url: string | null;
  // slab 분기보고 정성 정보(참고)
  funding_round: string | null;
  funding_series: string | null;
  total_raised: number | null;
  business_highlight: string | null;
  head_count: number | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

// 법인등기부등본 추출 스냅샷 (회사당 1행)
export type CorporateRegistration = {
  id: string;
  company_name: string;
  company_name_en: string | null;
  bubble_company_id: string | null;
  established_date: string | null;
  head_office_address: string | null;
  head_office_city: string | null;
  issue_date: string | null;
  total_issued_shares: number | null;
  shares_by_type: { type: string; count: number }[];
  shares_as_of_date: string | null;
  source: "upload" | "slab";
  source_file: string | null;
  source_file_url: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
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
