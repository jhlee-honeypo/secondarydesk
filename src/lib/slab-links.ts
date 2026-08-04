// slab(sparkERP) 화면으로 나가는 링크 조립. 서버·클라이언트 양쪽에서 쓰므로
// fetch·토큰이 들어있는 bubble.ts 와 분리해 둔다.
//
// ⚠️ 주소를 상수로 둔다 — 클라이언트 컴포넌트는 NEXT_PUBLIC_ 접두사 없는 env 를
// 읽을 수 없고(BUBBLE_API_BASE 는 서버 전용), slab 도메인은 고정이라 새 환경변수를
// 만들 이유가 없다. slab 도메인이 바뀌면 이 상수와 BUBBLE_API_BASE 를 함께 고친다.
const SLAB_BASE = "https://slab.sparkerp.co.kr";

/** 특정 기업·분기의 분기보고 상세 화면.
 *  실제 주소에서 확인한 형식(루트 페이지 + 쿼리):
 *    /?menu=quarterly-reporting&tab=detail&filter_company=<company._id>
 *      &filter_year=2026&filter_quarter=2분기&state=&current_page=1
 *  회사 id 가 없으면(ERP 미연결 매물) 링크를 만들 수 없어 null. */
export function slabQuarterlyUrl(
  bubbleCompanyId: string | null,
  year: number,
  month: number,
): string | null {
  if (!bubbleCompanyId || year <= 0 || month <= 0) return null;

  const params = new URLSearchParams({
    menu: "quarterly-reporting",
    tab: "detail",
    filter_company: bubbleCompanyId,
    filter_year: String(year),
    filter_quarter: `${month / 3}분기`,
    state: "",
    current_page: "1",
  });
  return `${SLAB_BASE}/?${params.toString()}`;
}
