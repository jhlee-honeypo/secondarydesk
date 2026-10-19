// 서류실사 스크리닝 — AI 판정 2종. 서버 전용(ANTHROPIC_API_KEY 필요).
//
// ir-extract.ts / registry-extract.ts 와 같은 구조(document 블록 + strict tool).
// 두 가지를 한다:
//
//   classifyDocument — 파일 하나가 체크리스트 16종 중 무엇인지 + 발급일·문서상
//                      회사명을 뽑는다. 파일당 1콜.
//   assessRisk       — 한 기업의 서류를 모아 리스크 기준별로 판정하고 종합
//                      통과/보류/탈락을 낸다. 기업당 1콜.
//
// 완결성 판정(1단계)은 여기 없다 — dd-completeness.ts 에서 코드로 센다.

import Anthropic from "@anthropic-ai/sdk";

import type { DocCriterionSeed, RiskCriterionSeed } from "./dd-defaults";
import {
  MAX_FILE_BYTES,
  readableKind,
  unsupportedReason,
  type ReadableKind,
} from "./dd-file-kind";

// 분류는 스캔 PDF·사진 찍은 증명서가 많아 비전 해상도가 정확도를 가른다
// (ir-extract 와 같은 이유로 sonnet-5: 장변 2576px).
const CLASSIFY_MODEL = "claude-sonnet-5";
// 리스크 판정은 계약서 조문을 읽고 해석하는 일이라 추론 품질이 더 중요하다.
const RISK_MODEL = "claude-opus-5";

// 리스크 판정은 여러 문서를 한 번에 넣으므로 합계도 묶는다(파일별 상한과
// 포맷 판별은 dd-file-kind.ts — 클라이언트와 공유한다).
const MAX_RISK_TOTAL_BYTES = 24 * 1024 * 1024;

function fileBlock(
  bytes: Uint8Array,
  kind: ReadableKind,
  mimeType: string,
): Anthropic.ContentBlockParam {
  const data = Buffer.from(bytes).toString("base64");
  if (kind === "image") {
    return {
      type: "image",
      source: {
        type: "base64",
        media_type: (mimeType || "image/png") as "image/png",
        data,
      },
    };
  }
  if (kind === "text") {
    return {
      type: "document",
      source: { type: "text", media_type: "text/plain", data: Buffer.from(bytes).toString("utf8") },
    };
  }
  return {
    type: "document",
    source: { type: "base64", media_type: "application/pdf", data },
  };
}

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

/** 'YYYY-MM-DD' 만 통과시킨다. 모델이 '2025년 3월' 같은 걸 내면 버린다(null = 미상). */
function isoDate(v: unknown): string | null {
  const s = str(v);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  return Number.isNaN(Date.parse(s)) ? null : s;
}

// =============================================================================
// 1. 서류 분류
// =============================================================================

export type ClassifyResult = {
  /** 체크리스트 코드. '' = 어느 항목에도 해당하지 않음. */
  criterionCode: string;
  docTitle: string;
  /** 문서에 찍힌 발급일/작성일. 없으면 null. */
  issuedDate: string | null;
  /** 내용의 기준 시점(주주명부 기준일, 재무제표 결산일 등). 없으면 null. */
  asOfDate: string | null;
  /** 문서에 적힌 회사명 — 엉뚱한 회사 서류가 섞였는지 본다. */
  docCompany: string;
  confidence: "high" | "medium" | "low";
  note: string;
};

export type ScreenUsage = { inputTokens: number; outputTokens: number };

const CLASSIFY_SYSTEM = [
  "You classify a document submitted by a Korean startup for investment due diligence.",
  "",
  "You are given ONE file and a checklist of document types. Decide which checklist item",
  "this file IS, and read off a few identifying facts.",
  "",
  "RULES:",
  "- Judge by the document's actual content, never by its filename. Filenames are wrong often.",
  "- A file may contain several documents concatenated (e.g. scanned bundle). Classify it as the",
  "  checklist item that occupies most of the file, and say so in note.",
  "- If the file matches NO checklist item, return criterionCode ''. Do not force a match.",
  "  A wrong match is worse than no match: it makes a missing document look submitted.",
  "- confidence: 'high' = the document names itself (표제가 명확). 'medium' = inferred from",
  "  content/format. 'low' = guessing. Use 'low' freely — a human reviews those.",
  "- Dates must be YYYY-MM-DD. If a date is partial or absent, return ''. Never invent one.",
  "- issuedDate = when this copy was issued/printed/signed (발급일·발행일·작성일·체결일).",
  "- asOfDate = the point in time the CONTENT describes (주주명부 기준일, 재무제표 결산일,",
  "  등기 열람일시 기준). Often different from issuedDate. '' if not stated.",
  "- docCompany = the company name as written in the document, verbatim.",
  "- note: anything the reviewer must know — wrong company, illegible scan, draft watermark,",
  "  expired validity, only part of the document present. Korean. '' if nothing notable.",
  "- Today's date is given in the user message. Use IT, not your own sense of the present, to",
  "  judge whether a date is future-dated. Your training cutoff is in the past; without this you",
  "  will call recently-issued documents 'future-dated' and raise a false flag on every one.",
  "",
  "Submit via submit_classification.",
].join("\n");

const CLASSIFY_TOOL: Anthropic.Tool = {
  name: "submit_classification",
  description: "Submit the document classification.",
  strict: true,
  input_schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      criterionCode: { type: "string" },
      docTitle: { type: "string" },
      issuedDate: { type: "string" },
      asOfDate: { type: "string" },
      docCompany: { type: "string" },
      confidence: { type: "string", enum: ["high", "medium", "low"] },
      note: { type: "string" },
    },
    required: [
      "criterionCode",
      "docTitle",
      "issuedDate",
      "asOfDate",
      "docCompany",
      "confidence",
      "note",
    ],
  },
};

function checklistText(criteria: DocCriterionSeed[]): string {
  return criteria
    .map((c) => `- ${c.code} — ${c.label}: ${c.guidance}`)
    .join("\n");
}

/** 파일 1건 분류. 호출 전에 readableKind 로 걸러 둘 것(미지원은 호출하지 않는다). */
export async function classifyDocument(args: {
  bytes: Uint8Array;
  mimeType: string;
  fileName: string;
  companyName: string;
  criteria: DocCriterionSeed[];
}): Promise<{ data: ClassifyResult; usage: ScreenUsage }> {
  const kind = readableKind(args.mimeType, args.fileName);
  if (kind === "unsupported")
    throw new Error(unsupportedReason(args.fileName));
  if (args.bytes.byteLength > MAX_FILE_BYTES)
    throw new Error(
      `파일이 너무 큽니다(${(args.bytes.byteLength / 1024 / 1024).toFixed(1)}MB, 상한 20MB)`,
    );

  const client = new Anthropic();
  const response = await client.messages.create({
    model: CLASSIFY_MODEL,
    max_tokens: 2000,
    thinking: { type: "disabled" },
    system: [
      { type: "text", text: CLASSIFY_SYSTEM, cache_control: { type: "ephemeral" } },
    ],
    tools: [CLASSIFY_TOOL],
    tool_choice: { type: "tool", name: "submit_classification" },
    messages: [
      {
        role: "user",
        content: [
          fileBlock(args.bytes, kind, args.mimeType),
          {
            type: "text",
            text: [
              `오늘 날짜: ${new Date().toISOString().slice(0, 10)}`,
              `제출 기업(참고용, 문서와 다를 수 있음): ${args.companyName}`,
              `파일명(참고용, 신뢰하지 말 것): ${args.fileName}`,
              "",
              "체크리스트:",
              checklistText(args.criteria),
              "",
              "Classify this file and submit via the tool.",
            ].join("\n"),
          },
        ],
      },
    ],
  });

  const usage = {
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
  };
  if (response.stop_reason === "max_tokens")
    throw new Error("출력 잘림 — 재시도 필요");
  if (response.stop_reason === "refusal")
    throw new Error("모델이 응답을 거부함 (stop_reason=refusal)");

  for (const block of response.content) {
    if (block.type === "tool_use" && block.name === "submit_classification") {
      const d = (block.input ?? {}) as Record<string, unknown>;
      const code = str(d.criterionCode);
      const conf = str(d.confidence);
      return {
        data: {
          // 모델이 체크리스트에 없는 코드를 지어내면 '해당 없음'으로 떨어뜨린다.
          criterionCode: args.criteria.some((c) => c.code === code) ? code : "",
          docTitle: str(d.docTitle),
          issuedDate: isoDate(d.issuedDate),
          asOfDate: isoDate(d.asOfDate),
          docCompany: str(d.docCompany),
          confidence: conf === "high" || conf === "medium" ? conf : "low",
          note: str(d.note),
        },
        usage,
      };
    }
  }
  throw new Error("분류 결과 없음 (tool_use 블록 누락)");
}

// =============================================================================
// 2. 리스크 판정
// =============================================================================

export type RiskLevel = "none" | "low" | "medium" | "high" | "unknown";
export type Verdict = "pass" | "hold" | "fail";

export type RiskItem = {
  code: string;
  label: string;
  level: RiskLevel;
  /** 무엇을 발견했나. 발견이 없으면 그렇게 적는다. */
  finding: string;
  /** 근거가 된 문서와 조문/페이지. 문서에서 직접 인용. */
  evidence: string;
};

export type RiskAssessment = {
  verdict: Verdict;
  /** 투심에 그대로 읽을 한 단락. */
  summary: string;
  items: RiskItem[];
  /** 서류만으로는 못 본 것 — 팀이 추가로 받아야 할 자료. */
  followUps: string[];
};

const RISK_SYSTEM = [
  "You are a Korean VC's investment associate doing document-based due diligence (서류실사)",
  "on a startup, ahead of an investment committee meeting (투심).",
  "",
  "You are given the company's submitted documents and a list of risk criteria.",
  "For EACH criterion, state what the documents show, then give an overall verdict.",
  "",
  "HARD RULES — these decide whether the output is usable:",
  "- Ground every finding in the documents. Quote the clause, line, or figure you relied on in",
  "  `evidence` (Korean, verbatim, with the document name). No quote = no finding.",
  "- NEVER use world knowledge about the company, its market, or its founders. You only know",
  "  what these files say.",
  "- Absence of evidence is not a finding. If the documents do not cover a criterion, set",
  "  level='unknown' and put what document would settle it into followUps. Do not guess.",
  "- CROSS-CHECK documents against each other. Several criteria are answered ONLY by comparing",
  "  two or three documents — 사업목적 across 사업자등록증/등기부등본/정관, 발행주식수·종류주식·",
  "  액면가 across 등기부등본/주주명부, 등기 임원 vs 경영진 현황. For these, quote the figure or",
  "  clause from EACH document side by side in `evidence` (e.g. \"등기부등본: 보통주 70,000주 /",
  "  주주명부 합계: 100,000주\"). A mismatch you did not look for is the most common way this",
  "  screening fails — these documents disagree in practice more often than they agree.",
  "- In Korean corporate registries, superseded entries are struck through (취소선/말소). Compare",
  "  only the currently-valid line; using a struck-through figure manufactures a false mismatch.",
  "- A SELF-CERTIFICATION IS A CLAIM, NOT VERIFICATION. Anything the company merely asserts about",
  "  itself — a '해당 없음' 확인서, a signed 확약서/체크리스트, a cover letter, a self-reported",
  "  현황표 with no underlying evidence — NEVER raises a criterion to level='none'. Leave it",
  "  'unknown' and name the document that would actually settle it. A founder's signature that",
  "  there are no lawsuits is not an absence of lawsuits.",
  "  Self-certifications matter in the opposite direction: when another document CONTRADICTS what",
  "  the company certified, say so explicitly and treat it as high severity — a false",
  "  representation is contractual grounds to cancel, not an item to be cured.",
  "- When a finding calls for details the company has not submitted (차입금의 대상·금액·이자율·",
  "  만기일·상환계획, 스톡옵션의 성명·행사가격·부여주식수·행사가능기간 등), name the exact fields",
  "  to request in followUps. The associate sends that list to the company verbatim.",
  "- level='none' means you checked and the risk is genuinely absent (e.g. 납세증명에 체납 없음).",
  "  Use 'unknown' when you could not check. The difference matters to the committee.",
  "- Do not evaluate the business, market size, or growth prospects. That is not this job.",
  "  This screening is about legal/financial blockers to investing, nothing else.",
  "- Today's date is given in the user message. Judge expiry and staleness against IT, never",
  "  against your own sense of the present — your training cutoff is in the past.",
  "",
  "VERDICT:",
  "- 'fail'  — a blocker that cannot be cured before the committee (e.g. 체납 확인, 핵심 IP가",
  "            대표 개인 명의, 기존 계약의 전원동의 조항, 중대 소송 계류).",
  "- 'hold'  — a real concern that a conversation or one more document could resolve.",
  "            Also use when too much is 'unknown' to judge.",
  "- 'pass'  — nothing in the documents blocks proceeding to the committee.",
  "- When torn between two, choose the more cautious one and say why in summary.",
  "",
  "summary: one Korean paragraph (3-5 sentences) an associate can read aloud at the committee.",
  "Lead with the verdict and the single most important reason. No hedging boilerplate.",
  "",
  "Submit via submit_risk_assessment.",
].join("\n");

const RISK_TOOL: Anthropic.Tool = {
  name: "submit_risk_assessment",
  description: "Submit the document due-diligence risk assessment.",
  strict: true,
  input_schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      verdict: { type: "string", enum: ["pass", "hold", "fail"] },
      summary: { type: "string" },
      items: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            code: { type: "string" },
            level: {
              type: "string",
              enum: ["none", "low", "medium", "high", "unknown"],
            },
            finding: { type: "string" },
            evidence: { type: "string" },
          },
          required: ["code", "level", "finding", "evidence"],
        },
      },
      followUps: { type: "array", items: { type: "string" } },
    },
    required: ["verdict", "summary", "items", "followUps"],
  },
};

export type RiskInputDoc = {
  /** 체크리스트 라벨(분류 결과). 모델에게 "이건 주주명부다" 를 알려 준다. */
  label: string;
  fileName: string;
  bytes: Uint8Array;
  mimeType: string;
};

/**
 * 한 기업의 서류를 모아 리스크 판정. 문서 합계가 한도를 넘으면 **뒤쪽 문서를
 * 버리고** 버린 목록을 함께 돌려준다 — 조용히 자르면 "자료가 없어 unknown" 인지
 * "우리가 안 넣어서 unknown" 인지 구별이 안 된다.
 */
export async function assessRisk(args: {
  companyName: string;
  docs: RiskInputDoc[];
  criteria: RiskCriterionSeed[];
  /**
   * 기업이 파일 대신 "해당 없음"이라고 적어 낸 항목. 서류가 아니라 **주장**이라
   * 문서 블록이 아닌 별도 텍스트로, 자기확약이라고 밝혀 넣는다.
   */
  declarations?: { label: string; reason: string }[];
}): Promise<{
  data: RiskAssessment;
  usage: ScreenUsage;
  skipped: { fileName: string; reason: string }[];
}> {
  const skipped: { fileName: string; reason: string }[] = [];
  const content: Anthropic.ContentBlockParam[] = [];
  let total = 0;

  for (const doc of args.docs) {
    const kind = readableKind(doc.mimeType, doc.fileName);
    if (kind === "unsupported") {
      skipped.push({ fileName: doc.fileName, reason: unsupportedReason(doc.fileName) });
      continue;
    }
    if (doc.bytes.byteLength > MAX_FILE_BYTES) {
      skipped.push({ fileName: doc.fileName, reason: "파일 20MB 초과" });
      continue;
    }
    if (total + doc.bytes.byteLength > MAX_RISK_TOTAL_BYTES) {
      skipped.push({ fileName: doc.fileName, reason: "합계 용량 한도 초과 — 따로 검토 필요" });
      continue;
    }
    total += doc.bytes.byteLength;
    // 파일 앞에 라벨을 붙여 둬야 모델이 evidence 에 문서명을 적을 수 있다.
    content.push({ type: "text", text: `[문서] ${doc.label || "미분류"} — ${doc.fileName}` });
    content.push(fileBlock(doc.bytes, kind, doc.mimeType));
  }

  const declarations = args.declarations ?? [];
  if (content.length === 0 && declarations.length === 0)
    throw new Error("판정할 수 있는 문서가 없습니다(전부 미지원 형식이거나 용량 초과).");

  if (declarations.length > 0) {
    content.push({
      type: "text",
      text: [
        "[회사의 자기확약 — 서류가 아니라 회사가 제출 포털에 직접 적어 낸 주장이다.",
        " 검증 자료가 아니므로 이것만으로 어떤 기준도 level='none' 이 될 수 없다.",
        " 다른 문서가 이 주장과 어긋나면 그 자체를 high 로 본다.]",
        "",
        ...declarations.map((d) => `· ${d.label}: "${d.reason}"`),
      ].join("\n"),
    });
  }

  const criteriaText = args.criteria
    .map((c) => `- ${c.code} — ${c.label}: ${c.guidance}`)
    .join("\n");

  const client = new Anthropic();
  const response = await client.messages.create({
    model: RISK_MODEL,
    // 기준 9개 × (finding + 인용 evidence) + summary. 잘리면 조용히 빈 항목이
    // 되므로 넉넉히 잡고 stop_reason 으로 검사한다.
    max_tokens: 16000,
    thinking: { type: "disabled" },
    system: [{ type: "text", text: RISK_SYSTEM, cache_control: { type: "ephemeral" } }],
    tools: [RISK_TOOL],
    tool_choice: { type: "tool", name: "submit_risk_assessment" },
    messages: [
      {
        role: "user",
        content: [
          ...content,
          {
            type: "text",
            text: [
              `오늘 날짜: ${new Date().toISOString().slice(0, 10)}`,
              `대상 기업: ${args.companyName}`,
              skipped.length > 0
                ? `※ 아래 파일은 이번 판정에 넣지 못했다: ${skipped
                    .map((s) => s.fileName)
                    .join(", ")}`
                : "",
              "",
              "리스크 기준:",
              criteriaText,
              "",
              "Assess every criterion above and submit via the tool.",
            ]
              .filter(Boolean)
              .join("\n"),
          },
        ],
      },
    ],
  });

  const usage = {
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
  };
  if (response.stop_reason === "max_tokens")
    throw new Error("출력 잘림 (max_tokens) — 재시도 필요");
  if (response.stop_reason === "refusal")
    throw new Error("모델이 응답을 거부함 (stop_reason=refusal)");

  for (const block of response.content) {
    if (block.type === "tool_use" && block.name === "submit_risk_assessment") {
      const d = (block.input ?? {}) as Record<string, unknown>;
      const labelByCode = new Map(args.criteria.map((c) => [c.code, c.label]));

      const rawItems = Array.isArray(d.items) ? d.items : [];
      const byCode = new Map<string, RiskItem>();
      for (const raw of rawItems) {
        const o = (raw ?? {}) as Record<string, unknown>;
        const code = str(o.code);
        if (!labelByCode.has(code)) continue; // 지어낸 기준은 버린다
        const lvl = str(o.level);
        byCode.set(code, {
          code,
          label: labelByCode.get(code)!,
          level: (["none", "low", "medium", "high", "unknown"] as const).includes(
            lvl as RiskLevel,
          )
            ? (lvl as RiskLevel)
            : "unknown",
          finding: str(o.finding),
          evidence: str(o.evidence),
        });
      }
      // 모델이 빠뜨린 기준은 'unknown' 으로 채운다 — 항목이 통째로 사라지면
      // 화면에서 "검토됨"처럼 보인다.
      const items: RiskItem[] = args.criteria.map(
        (c) =>
          byCode.get(c.code) ?? {
            code: c.code,
            label: c.label,
            level: "unknown",
            finding: "모델이 이 항목을 판정하지 않았습니다. 재실행이 필요합니다.",
            evidence: "",
          },
      );

      const verdict = str(d.verdict);
      const summary = str(d.summary);
      if (!summary) throw new Error("판정 사유가 비어 있음 — 재시도 필요");

      return {
        data: {
          verdict: (["pass", "hold", "fail"] as const).includes(verdict as Verdict)
            ? (verdict as Verdict)
            : "hold",
          summary,
          items,
          followUps: Array.isArray(d.followUps)
            ? d.followUps.map(str).filter(Boolean)
            : [],
        },
        usage,
        skipped,
      };
    }
  }
  throw new Error("판정 결과 없음 (tool_use 블록 누락)");
}
