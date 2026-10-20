// Office 문서(.docx/.xlsx) → 평문 텍스트. **서버 전용**(mammoth·SheetJS 는 Node).
//
// 왜 필요한가: 기업이 내는 서류는 두 갈래다. 공식 발급 서류(등기부·사업자등록증·
// 납세증명)는 PDF 로 오지만, **회사가 직접 만드는 자료**(창업자 현황표·타법인 겸직
// 확인서·지분구조표·자금 거래내역·분쟁 확인서)는 거의 워드·엑셀로 온다. 실측:
// 배치 SparkClaw #1 의 233건 중 21건이 Office 포맷이었고, 그 21건이 완결성에서
// 누락으로 잡힌 항목과 정확히 겹쳤다.
//
// dd-screen.ts 의 "읽을 수 없는 포맷에는 AI 를 호출하지 않는다"는 원칙은 **raw
// 바이트를 base64 로 밀어 넣는 경우**의 이야기다(모델이 깨진 데이터에서 그럴듯한
// 오답을 짓는다). 여기서 하는 일은 그 반대 — 문서 구조를 따라 텍스트를 뽑아
// 평문으로 넘긴다. 추출이 실패하거나 알맹이가 없으면 **호출하지 않고** 사람에게
// 보낸다(아래 MIN_CHARS).
//
// .hwp 는 여전히 미지원이다. HWP 5.0 은 ZIP 이 아니라 OLE 복합문서라 파서가 따로
// 필요한데, 실측 233건 중 1건뿐이라 품을 들일 자리가 아니다.

import mammoth from "mammoth";
import * as XLSX from "xlsx";

/**
 * 추출 결과가 이보다 짧으면 실패로 본다. 빈 문서·이미지만 든 문서·파싱 실패가
 * 여기 걸린다. 짧은 조각을 넘기면 모델이 모자란 정보로 추측을 시작한다.
 */
const MIN_CHARS = 30;

/**
 * 넘길 수 있는 최대 길이. 은행 거래내역 엑셀은 수천 행이라 그대로 넣으면 토큰이
 * 폭발한다(실측: 헬로우랩 거래내역 5건). 분류·리스크 판정 모두 문서의 성격과
 * 앞부분 내용으로 판단하므로 앞을 남기고 자른다 — 자른 사실은 본문에 밝힌다.
 */
const MAX_CHARS = 60_000;

export type OfficeKind = "docx" | "xlsx";

/** 확장자로만 판별한다 — 브라우저가 Office 파일에 엉뚱한 MIME 을 붙이는 일이 잦다. */
export function officeKind(fileName: string): OfficeKind | null {
  const ext = fileName.toLowerCase().split(".").pop() ?? "";
  if (ext === "docx") return "docx";
  if (ext === "xlsx" || ext === "xls") return "xlsx";
  return null;
}

function clamp(text: string): string {
  const t = text.replace(/\n{3,}/g, "\n\n").trim();
  if (t.length <= MAX_CHARS) return t;
  return `${t.slice(0, MAX_CHARS)}\n\n[※ 문서가 길어 앞부분 ${MAX_CHARS.toLocaleString()}자만 실었다. 뒷부분은 사람이 원본을 확인해야 한다.]`;
}

async function docxToText(bytes: Uint8Array): Promise<string> {
  // extractRawText 는 표를 셀 단위 줄바꿈으로 편다. 현황표·확인서가 주 대상이라
  // 서식보다 값이 중요하고, HTML 변환은 태그가 토큰만 먹는다.
  const { value } = await mammoth.extractRawText({ buffer: Buffer.from(bytes) });
  return value;
}

function xlsxToText(bytes: Uint8Array): string {
  const wb = XLSX.read(bytes, { type: "array" });
  return wb.SheetNames.map(
    (name) => `# 시트: ${name}\n${XLSX.utils.sheet_to_csv(wb.Sheets[name])}`,
  ).join("\n\n");
}

export type OfficeExtraction =
  | { ok: true; text: string }
  /** 호출하지 말고 사람에게 보낼 것. reason 은 화면에 그대로 띄운다. */
  | { ok: false; reason: string };

/** Office 문서에서 텍스트를 뽑는다. 실패는 예외가 아니라 결과로 돌려준다. */
export async function extractOfficeText(
  bytes: Uint8Array,
  fileName: string,
): Promise<OfficeExtraction> {
  const kind = officeKind(fileName);
  if (!kind) return { ok: false, reason: "Office 문서가 아닙니다" };

  let raw: string;
  try {
    raw = kind === "docx" ? await docxToText(bytes) : xlsxToText(bytes);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, reason: `문서를 여는 데 실패했습니다 — ${msg}` };
  }

  const text = clamp(raw);
  if (text.length < MIN_CHARS)
    return {
      ok: false,
      // 흔한 원인: 내용을 이미지로 붙여 넣은 워드 문서.
      reason:
        "문서에서 읽어낼 텍스트가 거의 없습니다(내용이 이미지일 수 있음) — PDF 로 변환해 다시 올려 주세요",
    };

  return { ok: true, text };
}
