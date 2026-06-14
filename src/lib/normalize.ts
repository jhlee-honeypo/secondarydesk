// 회사/투자사/묶음 이름 매칭용 정규화 — 소문자화 후 공백·구두점·법인격 표기 제거.
// 서버 임포트 매칭과 클라이언트 미리보기 추정이 같은 규칙을 쓰도록 공유한다.
export function normName(s: string | null | undefined): string {
  return (s ?? "")
    .toLowerCase()
    .replace(/주식회사|유한회사|유한책임회사/g, "")
    .replace(/㈜/g, "")
    .replace(/\((주|유)\)/g, "")
    .replace(/[^a-z0-9가-힣]/g, "");
}

// 매물명 셀에 ; 또는 줄바꿈으로 여러 매물을 적을 수 있다 → 이름 배열로.
export function splitNames(v: string | null | undefined): string[] {
  if (!v) return [];
  return v
    .split(/[;\n]+/)
    .map((x) => x.trim())
    .filter(Boolean);
}
