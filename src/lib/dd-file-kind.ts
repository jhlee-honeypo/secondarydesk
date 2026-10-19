// 파일 포맷 판별 — 서버(AI 호출 전 선별)와 클라이언트(업로드 직후 안내) 양쪽에서
// 쓴다. dd-screen.ts 에 두면 Anthropic SDK 가 브라우저 번들로 끌려오므로 분리했다.
//
// Claude 가 실제로 내용을 읽는 포맷만 통과시킨다. xlsx·hwp·docx 는 바이트를
// 넣어도 읽지 못하므로 **호출하지 않고** 사람 확인으로 보낸다 — 호출하면 모델이
// 깨진 바이트에서 그럴듯한 답을 지어낸다(조용한 오염).

const PDF = "application/pdf";
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"];
const TEXT_TYPES = ["text/plain", "text/csv", "text/markdown"];

export type ReadableKind = "pdf" | "image" | "text" | "unsupported";

/** 확장자까지 보는 이유: 브라우저가 .hwp 를 application/octet-stream 으로 올린다. */
export function readableKind(mimeType: string, fileName: string): ReadableKind {
  const mime = (mimeType || "").toLowerCase();
  const ext = fileName.toLowerCase().split(".").pop() ?? "";

  if (mime === PDF || ext === "pdf") return "pdf";
  if (IMAGE_TYPES.includes(mime)) return "image";
  if (["jpg", "jpeg", "png", "gif", "webp"].includes(ext)) return "image";
  if (TEXT_TYPES.includes(mime)) return "text";
  if (["txt", "csv", "md"].includes(ext)) return "text";
  return "unsupported";
}

/** 사람에게 보여 줄 미지원 사유. */
export function unsupportedReason(fileName: string): string {
  const ext = fileName.toLowerCase().split(".").pop() ?? "";
  if (["xlsx", "xls"].includes(ext)) return "엑셀 파일 — PDF 로 변환해 다시 올려 주세요";
  if (["hwp", "hwpx"].includes(ext)) return "한글 파일 — PDF 로 변환해 다시 올려 주세요";
  if (["doc", "docx"].includes(ext)) return "워드 파일 — PDF 로 변환해 다시 올려 주세요";
  if (["zip", "7z", "rar"].includes(ext)) return "압축 파일 — 풀어서 올려 주세요";
  return "AI 가 읽을 수 없는 형식 — PDF·이미지로 올려 주세요";
}

// Claude document 입력 한도는 32MB 이고 base64 가 1.33배 부푼다(IR덱 추출에서
// 26MB 조각이 413 으로 튕긴 실측이 있다). 여유를 둬 20MB 를 원본 상한으로 본다.
export const MAX_FILE_BYTES = 20 * 1024 * 1024;
