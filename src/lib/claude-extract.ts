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
  "3. niCurr (number): 당기순이익 current period. See SIGN RULES.",
  "4. revPrev (number): 매출액 previous period.",
  "5. niPrev (number): 당기순이익 previous period. See SIGN RULES.",
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
  "12. cogs (number): 매출원가 (매출원가/상품매출원가) current period from 손익계산서. If there is no 매출원가 line, set 0.",
  "13. operatingIncome (number): 영업이익 current period (labels: 영업이익/영업손익/영업손실) from 손익계산서 (= 매출총이익 − 판매비와관리비). See SIGN RULES.",
  "14. currentAssets (number): 유동자산 total (Ⅰ.유동자산) from 재무상태표.",
  "15. currentLiabilities (number): 유동부채 total (Ⅰ.유동부채) from 재무상태표.",
  "16. totalAssets (number): 자산총계 (자산총계/자산 총계) from 재무상태표.",
  "17. totalLiabilities (number): 부채총계 (부채총계/부채 총계) from 재무상태표.",
  "18. retainedEarnings (number): 이익잉여금 from 재무상태표 자본 section. See SIGN RULES.",
  "19. niLabel (string): the bottom-line label EXACTLY as printed, spaces removed (e.g. '당기순이익', '당기순손실', '당기순손익'). Empty string if the document has no such line.",
  "20. oiLabel (string): the 영업이익/영업손실/영업손익 line label exactly as printed, spaces removed. Empty string if absent.",
  "21. reLabel (string): the 이익잉여금/결손금 line label exactly as printed, spaces removed (e.g. '이익잉여금', '결손금', '이익잉여금(결손금)'). Empty string if absent.",
  "",
  "SIGN RULES (critical — Korean statements RENAME the line by outcome, so the label decides the sign):",
  "- The same line is titled 당기순이익 when profitable and 당기순손실 when loss-making; likewise 영업이익/영업손실 and 이익잉여금/결손금. Read the label first, then the digits.",
  "- Label contains 손실 or 결손 → the printed figure is a LOSS MAGNITUDE: output it NEGATIVE. Example: '당기순손실 15,361,732' → niCurr = -15361732.",
  "- Label contains 손실 or 결손 AND the figure is printed with a minus sign or in parentheses → DOUBLE NEGATIVE = a PROFIT: output it POSITIVE. Example: under a '당기순손실' label, 전기 column '−51,820,191' → niPrev = +51820191.",
  "- Label contains 이익 (당기순이익/영업이익/이익잉여금) → keep the printed sign as-is (a printed negative stays negative).",
  "- NEUTRAL captions cover both outcomes and therefore tell you NOTHING about the sign — keep the printed sign EXACTLY as-is, never flip. These include 당기순손익, 영업손익, 당기순이익(손실), 영업이익(손실), 이익잉여금(결손금), 미처분이익잉여금(미처리결손금). 표준재무제표(국세청 표준양식) uses these captions and prints losses with a minus sign, so '당기순손익 282,740,396' is a PROFIT of +282740396 and '이익잉여금 -1,603,367,420' is a deficit.",
  "- Decision order: (1) caption neutral (contains 손익, or both 이익 and 손실/결손) → print sign as-is. (2) caption loss-only (손실/결손 without 이익) → apply the loss rules above. (3) caption profit-only (이익) → print sign as-is.",
  "- Comparative statements print 당기 and 전기 columns under ONE label. Apply the rule to BOTH columns, independently per column sign. A '당기순손실' row showing 당기 15,361,732 and 전기 −51,820,191 yields niCurr = -15361732, niPrev = +51820191.",
  "- These rules govern niCurr, niPrev, operatingIncome and retainedEarnings. 매출/자산/부채/자본 items are printed as-is.",
  "",
  "RULES:",
  "- Missing value: use 0.",
  "- 천원 multiply 1000, 백만원 multiply 1000000.",
  "- CONSOLIDATED PRIORITY: If the document is a 연결재무제표/연결손익계산서 (consolidated) or shows both 별도(separate) and 연결(consolidated) figures, ALWAYS use the 연결(consolidated) figures (지배기업+종속기업 합산). Only fall back to 별도 figures when no consolidated figures exist.",
  "- No thousand separators in output.",
  "- If document is only 재무상태표 (balance sheet), set revCurr/niCurr/revPrev/niPrev/sga/cogs/operatingIncome to 0.",
  "- If document is only 손익계산서 (income statement), set cash/savings/totalEquity/capital/currentAssets/currentLiabilities/totalAssets/totalLiabilities/retainedEarnings to 0.",
  "- For 재무상태표 items in a comparative statement (당기/전기 or 제N기/제N-1기 두 열), use the CURRENT period (당기 / most recent) column.",
  "- SELF-CHECK (balance sheet): totalAssets must equal totalLiabilities + totalEquity. If they differ, re-read the statement.",
  "- SELF-CHECK (signs): niLabel contains 손실 → niCurr MUST be negative. oiLabel contains 손실 → operatingIncome MUST be negative. reLabel contains 결손 → retainedEarnings MUST be negative. Fix any violation before submitting.",
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
      cogs: { type: "number" },
      operatingIncome: { type: "number" },
      currentAssets: { type: "number" },
      currentLiabilities: { type: "number" },
      totalAssets: { type: "number" },
      totalLiabilities: { type: "number" },
      retainedEarnings: { type: "number" },
      niLabel: { type: "string" },
      oiLabel: { type: "string" },
      reLabel: { type: "string" },
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
      "cogs",
      "operatingIncome",
      "currentAssets",
      "currentLiabilities",
      "totalAssets",
      "totalLiabilities",
      "retainedEarnings",
      "niLabel",
      "oiLabel",
      "reLabel",
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
  cogs: number;
  operatingIncome: number;
  currentAssets: number;
  currentLiabilities: number;
  totalAssets: number;
  totalLiabilities: number;
  retainedEarnings: number;
  // 부호 판정의 근거로 쓴 줄 표제(저장하지 않음 — 검증·감사용).
  niLabel: string;
  oiLabel: string;
  reLabel: string;
};

const IMAGE_TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp"];

function num(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

// 라벨이 손실/결손이면 당기 값은 반드시 음수다 — 모델이 손실 금액을 양수로 낸 경우를
// 코드에서 되돌린다(대표적 오추출: '당기순손실 15,361,732' → +15361732).
// 전기(niPrev)는 같은 라벨 아래 부호가 반대일 수 있어(이중부정) 코드로 판정하지 않는다.
// '당기순이익(손실)'·'이익잉여금(결손금)' 같은 겸용 표제는 결과를 알려주지 않으므로 건드리지 않는다.
function signByLabel(value: number, label: unknown, lossWord: "손실" | "결손"): number {
  const l = typeof label === "string" ? label : "";
  const decisive = l.includes(lossWord) && !l.includes("이익");
  return decisive && value > 0 ? -value : value;
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
        niCurr: signByLabel(num(d.niCurr), d.niLabel, "손실"),
        revPrev: num(d.revPrev),
        niPrev: num(d.niPrev),
        cash: num(d.cash),
        savings: num(d.savings),
        totalEquity: num(d.totalEquity),
        capital: num(d.capital),
        month: num(d.month),
        sga: num(d.sga),
        cogs: num(d.cogs),
        operatingIncome: signByLabel(num(d.operatingIncome), d.oiLabel, "손실"),
        currentAssets: num(d.currentAssets),
        currentLiabilities: num(d.currentLiabilities),
        totalAssets: num(d.totalAssets),
        totalLiabilities: num(d.totalLiabilities),
        retainedEarnings: signByLabel(num(d.retainedEarnings), d.reLabel, "결손"),
        niLabel: String(d.niLabel ?? ""),
        oiLabel: String(d.oiLabel ?? ""),
        reLabel: String(d.reLabel ?? ""),
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
