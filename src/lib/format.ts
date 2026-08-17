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

/** 운용펀드 표시명 — 약칭 우선, 없으면 전체명. */
export function fundLabel(
  f: { name: string; short_name?: string | null } | null | undefined,
): string {
  if (!f) return "—";
  return f.short_name?.trim() || f.name;
}

/** 원 금액을 한국식 천단위 구분자로(예: 316,263,200). null/비유한 → "—". */
export function formatWon(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value))
    return "—";
  return Math.round(value).toLocaleString("ko-KR");
}

// 원화가 아닌 통화로 재무제표를 내는 기업들이 있다(달러·대만달러 등). 값은 문서에
// 적힌 통화 그대로 저장하므로(환산 안 함), 화면에서는 기호를 붙여 단위를 밝힌다.
// 없는 코드는 코드 그대로 앞에 붙인다(예: "VND 1,200").
const CURRENCY_SYMBOL: Record<string, string> = {
  USD: "$",
  TWD: "NT$",
  SGD: "S$",
  HKD: "HK$",
  JPY: "¥",
  CNY: "¥",
  EUR: "€",
  GBP: "£",
};

/** 통화 접두 기호 — 원화(기본)는 빈 문자열(기존 표기 그대로). */
export function currencyPrefix(currency: string | null | undefined): string {
  const code = (currency ?? "KRW").toUpperCase();
  if (!code || code === "KRW") return "";
  return CURRENCY_SYMBOL[code] ?? `${code} `;
}

/** 금액 + 통화 기호(예: KRW 316,263,200 · USD $419,032). null/비유한 → "—". */
export function formatMoney(
  value: number | null | undefined,
  currency: string | null | undefined,
): string {
  const s = formatWon(value);
  return s === "—" ? s : `${currencyPrefix(currency)}${s}`;
}

/** 천원(K) 단위 압축 표기 — EXIT 시나리오 카드/차트용(예: 299,994K). */
export function formatThousandWon(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value))
    return "—";
  return `${Math.round(value / 1000).toLocaleString("ko-KR")}K`;
}

/** 카드 미니 타임라인용 압축 날짜: YY.M.DD (예: 26.4.03). */
export function formatShortDate(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  const yy = String(d.getFullYear()).slice(2);
  const m = d.getMonth() + 1;
  const day = String(d.getDate()).padStart(2, "0");
  return `${yy}.${m}.${day}`;
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
