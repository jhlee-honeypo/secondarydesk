// 서류실사 화면의 공용 타입. 서버(data.ts·actions)와 클라이언트가 함께 쓰므로
// 런타임 의존성이 없는 이 파일에 둔다(share-audit/types.ts 와 같은 이유).

import type { CompletenessItem } from "@/lib/dd-completeness";
import type { RiskItem, Verdict } from "@/lib/dd-screen";

export type { Verdict };

export type DdBatch = {
  id: string;
  name: string;
  note: string;
  createdAt: string;
  companyCount: number;
};

export type DdCriterion = {
  id: string;
  kind: "doc" | "risk";
  code: string;
  label: string;
  guidance: string;
  required: boolean;
  maxAgeDays: number;
  sortOrder: number;
};

export type DdFile = {
  id: string;
  storagePath: string;
  fileName: string;
  mimeType: string;
  byteSize: number;
  /** AI 분류 코드. null = 미분류, '' = 해당 항목 없음 */
  criterionCode: string | null;
  docTitle: string;
  issuedDate: string | null;
  asOfDate: string | null;
  docCompany: string;
  confidence: "" | "high" | "medium" | "low";
  readable: boolean;
  classifyNote: string;
  classifiedAt: string | null;
  /** 사람이 고친 코드. 있으면 이쪽이 유효값 */
  overrideCode: string | null;
  uploadedAt: string;
};

export type CompletenessDetails = {
  items: CompletenessItem[];
  requiredMet: number;
  requiredTotal: number;
  unmatchedFileIds: string[];
  companyMismatches: { fileId: string; docCompany: string }[];
};

export type RiskDetails = {
  items: RiskItem[];
  followUps: string[];
  skipped: { fileName: string; reason: string }[];
};

export type DdAssessment = {
  stage: "completeness" | "risk";
  verdict: Verdict;
  summary: string;
  details: CompletenessDetails | RiskDetails;
  model: string;
  createdAt: string;
};

export type DdDecision = {
  verdict: Verdict;
  reason: string;
  updatedAt: string;
  updatedByName: string;
};

export type DdCompany = {
  id: string;
  name: string;
  note: string;
  files: DdFile[];
  completeness: (DdAssessment & { details: CompletenessDetails }) | null;
  risk: (DdAssessment & { details: RiskDetails }) | null;
  decision: DdDecision | null;
};

export type DdBatchData = {
  batch: DdBatch;
  docCriteria: DdCriterion[];
  riskCriteria: DdCriterion[];
  companies: DdCompany[];
};

/** 파일의 유효 분류 코드 — 사람이 고친 값이 AI 분류를 이긴다. */
export function effectiveCode(f: DdFile): string | null {
  return f.overrideCode ?? f.criterionCode;
}

/** 화면에 표시할 최종 판정 — 사람 결정 > 리스크 > 완결성 순. */
export function finalVerdict(c: DdCompany): {
  verdict: Verdict | null;
  source: "사람 확정" | "리스크 판정" | "서류 완결성" | null;
} {
  if (c.decision) return { verdict: c.decision.verdict, source: "사람 확정" };
  if (c.risk) return { verdict: c.risk.verdict, source: "리스크 판정" };
  if (c.completeness)
    return { verdict: c.completeness.verdict, source: "서류 완결성" };
  return { verdict: null, source: null };
}

export const VERDICT_LABEL: Record<Verdict, string> = {
  pass: "통과",
  hold: "보류",
  fail: "탈락",
};
