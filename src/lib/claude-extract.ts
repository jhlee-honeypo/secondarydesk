// 재무제표 추출 — Claude(Anthropic SDK)로 한국 재무제표 PDF/이미지에서 11개 값을 추출.
// 서버 전용(ANTHROPIC_API_KEY 필요) — 서버 액션에서만 import 한다.
//
// 추출 프롬프트·tool 스키마는 기존 구글시트(Apps Script) 도구의 것을 그대로 옮겼다.
// 모델은 비용을 고려해 Claude Sonnet 4.6 사용(PDF 1건당 ~$0.02–0.05).

import Anthropic from "@anthropic-ai/sdk";
import * as XLSX from "xlsx";

const MODEL = "claude-sonnet-4-6";

const SYSTEM_PROMPT = [
  "You are a precise financial data extractor for Korean corporate financial statements.",
  "You receive a PDF of a Korean financial statement and must extract specific values.",
  "",
  "EXTRACTION FIELDS:",
  "1. companyName (string): 회사명 from cover page or header. Remove 주식회사 or (주) prefixes. If cannot determine, set to 'unknown'.",
  "2. revCurr (number): 매출액 current period from 손익계산서 first line. YTD cumulative in KRW.",
  "3. niCurr (number): 당기순이익 current period. Loss is negative.",
  "4. revPrev (number): 매출액 previous period.",
  "5. niPrev (number): 당기순이익 previous period.",
  "6. cash (number): 현금 (cash on hand) portion of 현금및현금성자산, from 재무상태표 유동자산.",
  "   - CRITICAL: cash + savings MUST equal the TOTAL 현금및현금성자산. The two fields must NEVER overlap (no double-counting).",
  "   - If the statement shows a single combined '현금및현금성자산' line with NO breakdown: put the whole amount in cash, set savings to 0.",
  "   - If cash is broken into sub-lines (현금, 보통예금, 정기예금 등): put ONLY the pure 현금 line here. If there is no 현금 line, set cash to 0.",
  "   - Common labels: 현금, 현금및현금성자산, 현금 및 현금성자산.",
  "7. savings (number): 예금(deposits) portion of 현금및현금성자산, from 재무상태표 유동자산.",
  "   - Put 보통예금 and other 예금-type cash-equivalent sub-lines here (보통예금/예금/정기예금/외화예금 등).",
  "   - If 현금및현금성자산 is a single combined line already captured in cash: set savings to 0.",
  "   - Re-check: cash + savings must equal total 현금및현금성자산, with no amount counted in both.",
  "   - Common labels: 보통예금, 예금, 정기예금.",
  "8. totalEquity (number): 자본총계 from 재무상태표 자본 section.",
  "9. capital (number): 자본금 from 재무상태표 자본 section first line.",
  "10. month (number): report month - 3, 6, 9, or 12.",
  "11. sga (number): 판매비와관리비 from 손익계산서.",
  "",
  "RULES:",
  "- Missing value: use 0.",
  "- 천원 multiply 1000, 백만원 multiply 1000000.",
  "- Loss (손실) is negative. Parenthesized numbers are negative.",
  "- CONSOLIDATED PRIORITY: If the document is a 연결재무제표/연결손익계산서 (consolidated) or shows both 별도(separate) and 연결(consolidated) figures, ALWAYS use the 연결(consolidated) figures (지배기업+종속기업 합산). Only fall back to 별도 figures when no consolidated figures exist.",
  "- No thousand separators in output.",
  "- If document is only 재무상태표 (balance sheet), set revCurr/niCurr/revPrev/niPrev/sga to 0.",
  "- If document is only 손익계산서 (income statement), set cash/savings/totalEquity/capital to 0.",
  "",
  "Submit via submit_financial_data tool.",
].join("\n");

const EXTRACTION_TOOL: Anthropic.Tool = {
  name: "submit_financial_data",
  description: "Submit extracted financial data.",
  input_schema: {
    type: "object",
    properties: {
      companyName: { type: "string" },
      revCurr: { type: "number" },
      niCurr: { type: "number" },
      revPrev: { type: "number" },
      niPrev: { type: "number" },
      cash: { type: "number" },
      savings: { type: "number" },
      totalEquity: { type: "number" },
      capital: { type: "number" },
      month: { type: "number" },
      sga: { type: "number" },
    },
    required: [
      "companyName",
      "revCurr",
      "niCurr",
      "revPrev",
      "niPrev",
      "cash",
      "savings",
      "totalEquity",
      "capital",
      "month",
      "sga",
    ],
  },
};

export type ExtractedFinancials = {
  companyName: string;
  revCurr: number;
  niCurr: number;
  revPrev: number;
  niPrev: number;
  cash: number;
  savings: number;
  totalEquity: number;
  capital: number;
  month: number;
  sga: number;
};

const IMAGE_TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp"];

function num(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

function ext(fileName: string): string {
  return (fileName.split("?")[0].split("#")[0].split(".").pop() ?? "").toLowerCase();
}

function isXlsx(mediaType: string, fileName: string): boolean {
  return (
    mediaType.includes("spreadsheet") ||
    mediaType.includes("excel") ||
    ["xlsx", "xls"].includes(ext(fileName))
  );
}
function isImageFile(mediaType: string, fileName: string): boolean {
  return (
    mediaType.startsWith("image/") ||
    ["png", "jpg", "jpeg", "gif", "webp"].includes(ext(fileName))
  );
}

/** 지원 형식: PDF · 이미지 · 엑셀(.xlsx/.xls). 그 외(hwp 등)는 미지원. */
export function isSupportedFile(mediaType: string, fileName: string): boolean {
  if (isXlsx(mediaType, fileName) || isImageFile(mediaType, fileName)) return true;
  return mediaType === "application/pdf" || ext(fileName) === "pdf";
}

// 엑셀(연결재무제표가 엑셀로 제출되는 경우 등)을 시트별 CSV 텍스트로 변환.
function xlsxToText(bytes: Uint8Array): string {
  const wb = XLSX.read(bytes, { type: "array" });
  return wb.SheetNames.map(
    (name) => `# 시트: ${name}\n${XLSX.utils.sheet_to_csv(wb.Sheets[name])}`,
  ).join("\n\n");
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

async function runExtraction(
  fileBlock: Anthropic.ContentBlockParam,
): Promise<ExtractedFinancials> {
  const client = new Anthropic(); // ANTHROPIC_API_KEY env
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 1024,
    thinking: { type: "disabled" },
    system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
    tools: [EXTRACTION_TOOL],
    tool_choice: { type: "tool", name: "submit_financial_data" },
    messages: [
      {
        role: "user",
        content: [
          fileBlock,
          { type: "text", text: "Extract financial data and submit via the tool." },
        ],
      },
    ],
  });

  for (const block of response.content) {
    if (block.type === "tool_use" && block.name === "submit_financial_data") {
      const d = block.input as Record<string, unknown>;
      return {
        companyName: String(d.companyName ?? "").trim() || "unknown",
        revCurr: num(d.revCurr),
        niCurr: num(d.niCurr),
        revPrev: num(d.revPrev),
        niPrev: num(d.niPrev),
        cash: num(d.cash),
        savings: num(d.savings),
        totalEquity: num(d.totalEquity),
        capital: num(d.capital),
        month: num(d.month),
        sga: num(d.sga),
      };
    }
  }
  throw new Error("추출 결과 없음 (tool_use 블록 누락)");
}

/** 파일(bytes) 한 건에서 재무 11개 값 추출 — 형식(PDF/이미지/엑셀)에 맞게 라우팅. */
export async function extractFromFile(
  bytes: Uint8Array,
  mediaType: string,
  fileName: string,
): Promise<ExtractedFinancials> {
  if (isXlsx(mediaType, fileName)) {
    const text = xlsxToText(bytes);
    return runExtraction({
      type: "text",
      text: `다음은 엑셀로 제출된 재무제표를 시트별 CSV 로 변환한 것이다. 이 표에서 값을 추출하라.\n\n${text}`,
    });
  }
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
