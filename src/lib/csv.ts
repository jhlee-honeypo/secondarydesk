// 경량 CSV 파서(F13 임포트). 따옴표 필드("a,b", 이스케이프 "")·CRLF 처리.
// 외부 의존성 없이 클라이언트에서 사용.

export type ParsedCsv = { headers: string[]; rows: string[][] };

export function parseCsv(input: string): ParsedCsv {
  const text = input.replace(/^﻿/, ""); // BOM 제거
  const records: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n") {
      row.push(field);
      records.push(row);
      row = [];
      field = "";
    } else if (c !== "\r") {
      field += c;
    }
  }
  // 마지막 필드/행 마무리
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    records.push(row);
  }

  const headers = (records.shift() ?? []).map((h) => h.trim());
  // 완전히 빈 행 제거
  const rows = records.filter((r) => r.some((x) => x.trim() !== ""));
  return { headers, rows };
}
