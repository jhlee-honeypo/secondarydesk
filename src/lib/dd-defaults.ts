// 서류실사 평가 기준 기본값 — 배치를 만들 때 dd_criteria 로 '복사'된다.
// 여기를 고쳐도 이미 만들어진 배치는 바뀌지 않는다(판정 근거 보존, 마이그레이션
// 주석 §2 참조). 배치별 편집은 /dd 의 기준 탭에서 한다.

export type DocCriterionSeed = {
  code: string;
  label: string;
  /** AI 가 "이 파일이 그 서류인가" 를 알아보도록 돕는 설명. 동의어·발급기관·양식명. */
  guidance: string;
  required: boolean;
  /** 발급 후 N일이 지나면 만료로 본다. 0 = 신선도 무관. */
  maxAgeDays: number;
};

export type RiskCriterionSeed = {
  code: string;
  label: string;
  /** 무엇을 걸림돌로 볼지 판정 가이드. 그대로 프롬프트에 들어간다. */
  guidance: string;
};

// 신선도 기준: 납세증명서는 유효기간이 통상 30일이라 90일을 넘으면 투심 시점에
// 무의미하다. 등기·등록증류는 변동 사항이 반영된 최신본인지가 중요해 6개월.
const DAYS_3M = 90;
const DAYS_6M = 180;

export const DOC_CRITERIA: DocCriterionSeed[] = [
  {
    code: "biz_cert",
    label: "사업자등록증",
    guidance:
      "사업자등록증 또는 사업자등록증명원. 국세청/홈택스 발급. 상호·사업자등록번호·대표자·업태/종목·개업연월일이 적혀 있다.",
    required: true,
    maxAgeDays: DAYS_6M,
  },
  {
    code: "registry",
    label: "법인등기부등본",
    guidance:
      "법인등기사항전부증명서(등기부등본). 대법원 인터넷등기소 발급. 회사성립연월일·본점·발행주식의 총수·임원 변동 이력이 나열되고 말소된 줄에 취소선이 있다.",
    required: true,
    maxAgeDays: DAYS_6M,
  },
  {
    code: "articles",
    label: "정관",
    guidance:
      "회사 정관(定款). 제1조 상호, 목적, 발행예정주식총수, 종류주식, 주주총회·이사회 조항이 조문 형태로 이어진다. 부칙에 최종 개정일이 있다.",
    required: true,
    maxAgeDays: 0,
  },
  {
    code: "license",
    label: "인허가/신고 증빙",
    guidance:
      "영위 업종에 필요한 인허가·등록·신고 증명(예: 통신판매업신고증, 의료기기 제조/수입업 허가, 전자금융업 등록, 연구소 인정서). 업종상 불필요하면 '해당 없음'.",
    required: false,
    maxAgeDays: 0,
  },
  {
    code: "shareholders",
    label: "주주명부",
    guidance:
      "주주명부. 주주 성명/법인명·주식 종류·보유 주식수·지분율이 표로 나열되고 합계가 발행주식총수와 맞는다.",
    required: true,
    maxAgeDays: DAYS_6M,
  },
  {
    code: "founders",
    label: "창업자/경영진 현황",
    guidance:
      "창업자·등기임원·핵심 경영진의 이력(학력·경력)·역할·지분 요약. 팀 소개 자료나 이력서 묶음일 수 있다.",
    required: true,
    maxAgeDays: 0,
  },
  {
    code: "affiliations",
    label: "타법인 운영/겸직/특수관계 현황",
    guidance:
      "대표·임원이 다른 법인의 대표/임원을 겸하거나 지분을 보유한 내역, 계열사·특수관계자 목록과 그들과의 거래 내역.",
    required: true,
    maxAgeDays: 0,
  },
  {
    code: "prior_investment",
    label: "기존 투자/주주간계약",
    guidance:
      "신주인수계약서(SPA)·주주간계약서(SHA)·투자계약서·전환사채(CB)/SAFE 계약. 우선매수권·동반매도청구권(Drag-along)·상환권(RCPS)·이익배당 우선·경영사항 동의권 조항이 핵심.",
    required: true,
    maxAgeDays: 0,
  },
  {
    code: "financials",
    label: "재무제표",
    guidance:
      "재무상태표·손익계산서(가능하면 현금흐름표). 표준재무제표증명원이나 세무조정계산서, 감사보고서도 해당. 직전 연도 결산 기준.",
    required: true,
    maxAgeDays: 0,
  },
  {
    code: "tax_clearance",
    label: "국세/지방세 납세증명",
    guidance:
      "국세 납세증명서(홈택스)와 지방세 납세증명서(정부24). '체납액이 없음'이 명시된다. 유효기간이 짧아 최신본이어야 한다.",
    required: true,
    maxAgeDays: DAYS_3M,
  },
  {
    code: "debt",
    label: "차입/보증/담보 현황",
    guidance:
      "금융기관 차입금 명세, 대표이사 연대보증 내역, 부동산/지식재산 담보 설정, 리스·팩토링. 차입이 전혀 없으면 '없음' 확인서.",
    required: true,
    maxAgeDays: 0,
  },
  {
    code: "capital",
    label: "자본금 납입/자금 현황",
    guidance:
      "주금납입보관증명서·잔고증명서·최근 예금 거래내역. 자본금이 실제로 납입되고 유지됐는지를 본다.",
    required: true,
    maxAgeDays: DAYS_3M,
  },
  {
    code: "ip",
    label: "지식재산/기술권리",
    guidance:
      "특허·상표·디자인 등록원부 또는 출원 명세, 소프트웨어 저작권 등록증, 기술이전·라이선스 계약. 권리자 명의가 법인인지가 핵심.",
    required: false,
    maxAgeDays: 0,
  },
  {
    code: "contracts",
    label: "주요 계약/정부지원 약정",
    guidance:
      "매출 비중이 큰 고객·공급사 계약, 정부 R&D 과제 협약서, 보조금 교부결정서. 기술료 납부·지분 제한 같은 사후 의무가 붙는다.",
    required: false,
    maxAgeDays: 0,
  },
  {
    code: "litigation",
    label: "분쟁/제재/우발채무 확인",
    guidance:
      "진행 중인 소송·중재·노동위원회 사건, 행정 제재·과징금, 우발채무. 없으면 '해당 없음' 확인서(대표 서명).",
    required: true,
    maxAgeDays: 0,
  },
  {
    code: "employment",
    label: "고용/핵심인력 계약",
    guidance:
      "핵심 인력 근로계약서, 스톡옵션(주식매수선택권) 부여 계약·이사회/주총 의사록, 비밀유지·경업금지·직무발명 귀속 약정.",
    required: true,
    maxAgeDays: 0,
  },
];

export const RISK_CRITERIA: RiskCriterionSeed[] = [
  {
    code: "cap_table",
    label: "주주구성·지배구조",
    guidance:
      "창업자 합산 지분이 과도하게 낮아 다음 라운드 후 동기부여가 깨지는가. 사업과 무관한 다수 소액주주나 명의신탁 정황이 있는가. 주주명부 합계가 등기 발행주식총수와 어긋나는가.",
  },
  {
    code: "toxic_terms",
    label: "기존 투자계약 독소조항",
    guidance:
      "기존 주주간계약에 신규 투자자를 구속하는 조항이 있는가 — 과도한 상환권(RCPS 조기상환), 동반매도청구권, 전원동의 수준의 경영사항 동의권, 비정상적 우선배당률, 리픽싱 조항.",
  },
  {
    code: "tax_arrears",
    label: "조세 체납·공과금",
    guidance:
      "국세/지방세 납세증명에 체납이 표시되거나, 증명서가 투심 시점 기준 만료됐거나, 4대보험 체납 정황이 있는가.",
  },
  {
    code: "leverage",
    label: "차입·보증·담보 과다",
    guidance:
      "자본 규모 대비 차입금이 과다한가. 대표이사 연대보증이 걸려 있는가. 핵심 자산(IP 포함)에 담보가 설정돼 있는가.",
  },
  {
    code: "capital_substance",
    label: "자본금 납입 실체",
    guidance:
      "자본금이 납입 직후 대표/특수관계자에게 인출된 정황(가장납입)이 있는가. 재무제표상 현금과 잔고증명이 어긋나는가.",
  },
  {
    code: "ip_ownership",
    label: "지식재산 귀속",
    guidance:
      "핵심 특허·상표·소프트웨어 권리자가 법인이 아니라 대표 개인이나 타법인 명의인가. 직무발명 귀속 약정이 없는가. 전용실시권이 타사에 설정돼 있는가.",
  },
  {
    code: "litigation",
    label: "분쟁·제재·우발채무",
    guidance:
      "진행 중인 소송·중재·노동 분쟁, 행정 제재·과징금, 확정되지 않은 배상 책임이 있는가. 금액이 자본 규모에 비해 유의미한가.",
  },
  {
    code: "conflict",
    label: "겸직·특수관계 거래",
    guidance:
      "대표·핵심인력이 타법인을 함께 운영해 시간/이해가 분산되는가. 특수관계자와의 매출·매입이 매출의 유의미한 비중인가(매출 부풀리기 정황).",
  },
  {
    code: "key_person",
    label: "핵심인력 이탈 위험",
    guidance:
      "핵심 인력이 근로계약·스톡옵션 없이 묶여 있지 않은가. 경업금지·비밀유지 약정이 없는가. 등기임원 변동이 최근 잦은가.",
  },
];

/** 체크리스트 코드 → 라벨 (분류 결과 표시용 폴백) */
export const DOC_LABEL_BY_CODE: Record<string, string> = Object.fromEntries(
  DOC_CRITERIA.map((c) => [c.code, c.label]),
);
