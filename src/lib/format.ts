/** KRW 금액을 억 단위로 가독성 있게 표기. 1억 미만은 천 단위 콤마. */
export function formatKRW(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  if (value >= 1e8) {
    const eok = value / 1e8;
    const rounded = Math.round(eok * 10) / 10;
    return `${rounded.toLocaleString("ko-KR")}억`;
  }
  if (value >= 1e4) {
    return `${Math.round(value / 1e4).toLocaleString("ko-KR")}만`;
  }
  return value.toLocaleString("ko-KR");
}

/** ISO 날짜 문자열을 YYYY.MM.DD 로 표기. */
export function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}.${m}.${day}`;
}

/** ISO 문자열을 YYYY.MM.DD HH:mm 로 표기(활동 타임라인용). */
export function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${formatDate(value)} ${hh}:${mm}`;
}
