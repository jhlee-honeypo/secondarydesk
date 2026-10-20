// 파일 포맷 판별 — 서버(AI 호출 전 선별)와 클라이언트(업로드 직후 안내) 양쪽에서
// 쓴다. dd-screen.ts 에 두면 Anthropic SDK 가 브라우저 번들로 끌려오므로 분리했다.
//
// Claude 가 내용을 읽을 수 있는 포맷만 통과시킨다. 바이트를 그대로 넣어도 읽지
// 못하는 포맷은 **호출하지 않고** 사람 확인으로 보낸다 — 호출하면 모델이 깨진
// 바이트에서 그럴듯한 답을 지어낸다(조용한 오염).
//
// 단 .docx/.xlsx 는 'office' 로 따로 둔다. 모델에 바이트를 넘기는 게 아니라
// 서버에서 텍스트를 뽑아(dd-office-text.ts) 평문으로 넘기기 때문이다. 기업이
// 직접 만드는 현황표·확인서가 거의 이 포맷으로 오므로 버리면 필수 항목이
// 통째로 누락된다(실측 233건 중 21건). .hwp 는 OLE 복합문서라 여전히 미지원.

const PDF = "application/pdf";
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"];
const TEXT_TYPES = ["text/plain", "text/csv", "text/markdown"];

export type ReadableKind = "pdf" | "image" | "text" | "office" | "unsupported";

/** 확장자까지 보는 이유: 브라우저가 .hwp 를 application/octet-stream 으로 올린다. */
export function readableKind(mimeType: string, fileName: string): ReadableKind {
  const mime = (mimeType || "").toLowerCase();
  const ext = fileName.toLowerCase().split(".").pop() ?? "";

  if (mime === PDF || ext === "pdf") return "pdf";
  if (IMAGE_TYPES.includes(mime)) return "image";
  if (["jpg", "jpeg", "png", "gif", "webp"].includes(ext)) return "image";
  if (TEXT_TYPES.includes(mime)) return "text";
  if (["txt", "csv", "md"].includes(ext)) return "text";
  // 확장자로만 본다 — 브라우저가 Office 파일에 엉뚱한 MIME 을 붙이는 일이 잦다.
  if (["docx", "xlsx", "xls"].includes(ext)) return "office";
  return "unsupported";
}

/** 사람에게 보여 줄 미지원 사유. */
export function unsupportedReason(fileName: string): string {
  const ext = fileName.toLowerCase().split(".").pop() ?? "";
  // .doc(구 바이너리 포맷)은 mammoth 가 못 읽는다 — .docx 와 갈라 둔다.
  if (ext === "doc") return "구형 워드(.doc) — .docx 나 PDF 로 변환해 다시 올려 주세요";
  if (["hwp", "hwpx"].includes(ext)) return "한글 파일 — PDF 로 변환해 다시 올려 주세요";
  if (["zip", "7z", "rar"].includes(ext)) return "압축 파일 — 풀어서 올려 주세요";
  return "AI 가 읽을 수 없는 형식 — PDF·이미지로 올려 주세요";
}

// Claude document 입력 한도는 32MB 이고 base64 가 1.33배 부푼다(IR덱 추출에서
// 26MB 조각이 413 으로 튕긴 실측이 있다). 여유를 둬 20MB 를 원본 상한으로 본다.
export const MAX_FILE_BYTES = 20 * 1024 * 1024;
