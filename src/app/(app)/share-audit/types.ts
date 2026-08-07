// 발행주식수 점검 화면의 공용 타입. 서버(data.ts·export)와 클라이언트(대시보드)가
// 함께 쓰므로 런타임 의존성이 없는 이 파일에 둔다.
export type ReviewStatus = "open" | "ack" | "dismissed";

export type Verdict = "일치" | "불일치" | "등기 없음" | "slab 미기재";

export type ShareAuditRow = {
  companyId: string; // slab company._id
  companyName: string;
  companyNameEn: string | null;
  status: string; // 회사 존속상태 LIVE/EXIT/W/O
  fundIds: string[]; // 운용펀드 id(필터용)
  fundLabels: string[]; // 조합 표시명
  slabShares: number | null;
  reportShares: number | null;
  reportPeriod: string | null; // 분기보고값이 나온 분기
  registryShares: number | null;
  registrySharesAsOf: string | null; // 기준일 = 마지막 변경등기일
  registryIssueDate: string | null; // 발행일 = 등기부를 발급받은 날(확인 시점)
  registrySourceUrl: string | null;
  registrySourceFile: string | null;
  verdict: Verdict;
  delta: number | null; // slab − 등기
  reportDiff: boolean;
};

export type FundSummary = {
  id: string;
  label: string;
  total: number;
  match: number;
  mismatch: number;
  noRegistry: number;
  noSlab: number;
  reportDiff: number;
};

/** 조치 큐 항목 — 사람이 직접 확인해야 하는 건만 담는다. */
export type QueueItem = {
  companyId: string;
  companyName: string;
  fundIds: string[];
  fundLabels: string[];
  severity: "red" | "yellow"; // red=조치(불일치), yellow=확인
  kind: "발행주식수 불일치" | "확인 필요";
  detail: string;
  slabShares: number | null;
  reportShares: number | null;
  reportPeriod: string | null;
  registryShares: number | null;
  registrySharesAsOf: string | null;
  registryIssueDate: string | null;
  registrySourceUrl: string | null;
  reviewStatus: ReviewStatus;
  memoCount: number;
};

export type ShareAuditData = {
  rows: ShareAuditRow[];
  summaries: FundSummary[];
  queue: QueueItem[];
  withRegistry: number;
  excludedTestRecords: number;
};
