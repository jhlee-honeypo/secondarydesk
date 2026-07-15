// 법인등기부등본 추출 — Claude(Anthropic SDK)로 한국 법인등기부등본 PDF/이미지에서
// 설립일·본점·발행일·발행주식(총수·종류별) 을 추출. 서버 전용(ANTHROPIC_API_KEY 필요).
//
// claude-extract.ts(재무제표 추출)와 동일한 구조 — document/image 블록을 Claude 에
// 직접 넣어 tool 로 구조화 추출한다. 등기부등본은 대부분 스캔 이미지 PDF 라 별도 OCR
// 없이 Claude document 입력의 비전으로 읽는다(스파이크에서 5/5 검증).

import Anthropic from "@anthropic-ai/sdk";

const MODEL = "claude-sonnet-4-6";

const SYSTEM_PROMPT = [
  "You extract structured data from a Korean corporate registry certificate (법인등기부등본).",
  "The document contains multiple historical entries; superseded lines are struck through (밑줄/취소선) or marked 말소.",
  "ALWAYS return the CURRENTLY-VALID value (the most recent completed 변경등기 that is NOT struck through), never a superseded one.",
  "",
  "EXTRACTION FIELDS:",
  "1. companyName (string): 상호(회사명) from the header. Remove 주식회사 or (주) prefixes. If cannot determine, 'unknown'.",
  "2. establishedDate (YYYY-MM-DD): 회사성립연월일 / 설립등기일. If absent, ''.",
  "3. headOfficeAddress (string): 현재 유효한 본점 주소 전체. Ignore struck-through past addresses.",
  "4. headOfficeCity (string): 본점 주소의 광역시/도 only (예: '서울특별시','경기도','경상남도'). For a foreign address, the country or state.",
  "5. issueDate (YYYY-MM-DD): 문서 하단(주로 우측 하단)의 발행일/발급일/열람일시 날짜. If absent, ''.",
  "6. totalIssuedShares (number): '발행주식의 총수와 그 종류 및 각각의 수' 항목의 현재 유효한 발행주식 총수. Ignore struck-through past values.",
  "7. sharesByType (array of {type, count}): 위 항목의 종류별 주식 수 (예: {type:'보통주식',count:300000}). 현재 유효한 값만. If none, [].",
  "8. sharesAsOfDate (YYYY-MM-DD): 위 발행주식 값이 반영된 변경등기일(등기 연월일). If unclear, ''.",
  "",
  "RULES:",
  "- Numbers have no thousand separators.",
  "- Missing string: ''. Missing number: 0.",
  "- The sum of sharesByType[].count should equal totalIssuedShares — recheck if it does not.",
  "",
  "Submit via submit_registration_data tool.",
].join("\n");

const EXTRACTION_TOOL: Anthropic.Tool = {
  name: "submit_registration_data",
  description: "Submit extracted corporate-registry data.",
  input_schema: {
    type: "object",
    properties: {
      companyName: { type: "string" },
      establishedDate: { type: "string" },
      headOfficeAddress: { type: "string" },
      headOfficeCity: { type: "string" },
      issueDate: { type: "string" },
      totalIssuedShares: { type: "number" },
      sharesByType: {
        type: "array",
        items: {
          type: "object",
          properties: {
            type: { type: "string" },
            count: { type: "number" },
          },
          required: ["type", "count"],
        },
      },
      sharesAsOfDate: { type: "string" },
    },
    required: [
      "companyName",
      "establishedDate",
      "headOfficeAddress",
      "headOfficeCity",
      "issueDate",
      "totalIssuedShares",
      "sharesByType",
      "sharesAsOfDate",
    ],
  },
};

export type ShareClass = { type: string; count: number };

export type ExtractedRegistration = {
  companyName: string;
  establishedDate: string; // YYYY-MM-DD | ""
  headOfficeAddress: string;
  headOfficeCity: string;
  issueDate: string; // YYYY-MM-DD | ""
  totalIssuedShares: number;
  sharesByType: ShareClass[];
  sharesAsOfDate: string; // YYYY-MM-DD | ""
};

const IMAGE_TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp"];

function num(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function ext(fileName: string): string {
  return (fileName.split("?")[0].split("#")[0].split(".").pop() ?? "").toLowerCase();
}

function isImageFile(mediaType: string, fileName: string): boolean {
  return (
    mediaType.startsWith("image/") ||
    ["png", "jpg", "jpeg", "gif", "webp"].includes(ext(fileName))
  );
}

/** 지원 형식: PDF · 이미지. 등기부등본은 PDF(스캔 포함)가 일반적이며 그 외는 미지원. */
export function isSupportedFile(mediaType: string, fileName: string): boolean {
  if (isImageFile(mediaType, fileName)) return true;
  return mediaType === "application/pdf" || ext(fileName) === "pdf";
}

function imageMediaType(
  mediaType: string,
  fileName: string,
): "image/png" | "image/jpeg" | "image/gif" | "image/webp" {
  if (IMAGE_TYPES.includes(mediaType))
    return mediaType as "image/png" | "image/jpeg" | "image/gif" | "image/webp";
  const e = ext(fileName);
  if (e === "jpg" || e === "jpeg") return "image/jpeg";
  if (e === "gif") return "image/gif";
  if (e === "webp") return "image/webp";
  return "image/png";
}

function normalizeShares(v: unknown): ShareClass[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((x) => {
      const o = (x ?? {}) as Record<string, unknown>;
      return { type: str(o.type), count: num(o.count) };
    })
    .filter((s) => s.type || s.count);
}

async function runExtraction(
  fileBlock: Anthropic.ContentBlockParam,
): Promise<ExtractedRegistration> {
  const client = new Anthropic(); // ANTHROPIC_API_KEY env
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 2048,
    thinking: { type: "disabled" },
    system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
    tools: [EXTRACTION_TOOL],
    tool_choice: { type: "tool", name: "submit_registration_data" },
    messages: [
      {
        role: "user",
        content: [
          fileBlock,
          { type: "text", text: "Extract registry data and submit via the tool." },
        ],
      },
    ],
  });

  for (const block of response.content) {
    if (block.type === "tool_use" && block.name === "submit_registration_data") {
      const d = block.input as Record<string, unknown>;
      return {
        companyName: str(d.companyName) || "unknown",
        establishedDate: str(d.establishedDate),
        headOfficeAddress: str(d.headOfficeAddress),
        headOfficeCity: str(d.headOfficeCity),
        issueDate: str(d.issueDate),
        totalIssuedShares: num(d.totalIssuedShares),
        sharesByType: normalizeShares(d.sharesByType),
        sharesAsOfDate: str(d.sharesAsOfDate),
      };
    }
  }
  throw new Error("추출 결과 없음 (tool_use 블록 누락)");
}

/** 등기부등본 파일(bytes) 1건에서 값 추출 — 형식(PDF/이미지)에 맞게 라우팅. */
export async function extractFromRegistryFile(
  bytes: Uint8Array,
  mediaType: string,
  fileName: string,
): Promise<ExtractedRegistration> {
  const base64 = Buffer.from(bytes).toString("base64");
  if (isImageFile(mediaType, fileName)) {
    return runExtraction({
      type: "image",
      source: { type: "base64", media_type: imageMediaType(mediaType, fileName), data: base64 },
    });
  }
  // 그 외(불명확 content-type 포함)는 PDF 문서로 처리
  return runExtraction({
    type: "document",
    source: { type: "base64", media_type: "application/pdf", data: base64 },
  });
}

/** URL 로 직접 추출 — 파일을 base64 로 본문에 싣지 않고 Anthropic 이 URL 에서
 *  받게 한다. 대용량 PDF(요청 본문 413) 폴백용. 문서 자체 한도(32MB·100p)는 여전히 적용. */
export async function extractFromRegistryUrl(
  url: string,
): Promise<ExtractedRegistration> {
  return runExtraction({ type: "document", source: { type: "url", url } });
}

/** 종류별 합 = 총수 검증(백필 품질 게이트용). 총수 0 이면 검증 생략(true). */
export function sharesConsistent(d: ExtractedRegistration): boolean {
  if (!d.totalIssuedShares) return true;
  const sum = d.sharesByType.reduce((n, s) => n + s.count, 0);
  return sum === d.totalIssuedShares;
}
