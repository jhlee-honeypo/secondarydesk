// Bubble.io(sparkERP) Data API 온디맨드 조회. (서버 전용 — 서버 액션에서만 import)
//   - 베이스 URL은 환경변수 BUBBLE_API_BASE, 없으면 운영 도메인으로 폴백.
//   - 토큰(BUBBLE_API_TOKEN)이 설정돼 있으면 Bearer 로 전송. 현재 데이터는
//     공개 읽기라 토큰 없이도 동작하며, 잘못된 토큰을 보내면 401 이 나므로
//     "비어 있지 않을 때만" 헤더를 붙인다(유효 토큰 발급 후 env 에 넣으면 됨).

const BASE = (
  process.env.BUBBLE_API_BASE || "https://slab.sparkerp.co.kr"
).replace(/\/$/, "");
const TOKEN = process.env.BUBBLE_API_TOKEN || "";

type BubbleListResponse = {
  response?: {
    results?: Record<string, unknown>[];
    cursor?: number;
    count?: number;
    remaining?: number;
  };
};

async function bubblePage(
  type: string,
  cursor: number,
  limit: number,
): Promise<BubbleListResponse["response"]> {
  const params = new URLSearchParams();
  params.set("cursor", String(cursor));
  params.set("limit", String(limit));

  const url = `${BASE}/api/1.1/obj/${type}?${params.toString()}`;
  const headers: Record<string, string> = {};
  if (TOKEN) headers.Authorization = `Bearer ${TOKEN}`;

  const res = await fetch(url, { headers, cache: "no-store" });
  if (!res.ok) throw new Error(`Bubble ${type} ${res.status}`);
  const json = (await res.json()) as BubbleListResponse;
  return json.response;
}

// Bubble 의 "text contains" 는 부분문자열이 아니라 토큰(단어) 단위 매칭이라
// 자동완성에 부적합 → 전체 레코드를 받아 메모리에서 부분문자열 필터한다.
// fund(22)·company(338) 규모라 부담 적고, 모듈 캐시(TTL 5분)로 반복 요청 차단.
const CACHE_TTL_MS = 5 * 60 * 1000;
const cache = new Map<string, { at: number; rows: Record<string, unknown>[] }>();

async function fetchAll(type: string): Promise<Record<string, unknown>[]> {
  const hit = cache.get(type);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.rows;

  const rows: Record<string, unknown>[] = [];
  let cursor = 0;
  // 최대 10페이지(1000건) 안전장치.
  for (let i = 0; i < 10; i++) {
    const resp = await bubblePage(type, cursor, 100);
    const batch = resp?.results ?? [];
    rows.push(...batch);
    const remaining = resp?.remaining ?? 0;
    cursor += batch.length;
    if (batch.length === 0 || remaining <= 0) break;
  }
  cache.set(type, { at: Date.now(), rows });
  return rows;
}

// ---- 정규화 타입 ----------------------------------------------------------

export type BubbleFund = {
  id: string;
  name: string;
  size: number | null; // 약정액(원)
  currency: string | null;
  startDate: string | null; // ISO
  endDate: string | null; // ISO (만기)
};

export type BubbleCompany = {
  id: string;
  nameKr: string;
  nameEn: string | null;
  sector: string | null; // 우리 SECTOR_OPTIONS 로 best-effort 매핑된 값
  sectorRaw: string | null; // Bubble 원문(참고 표시용)
  lastRoundType: string | null; // → listing.stage
  sharePrice: number | null; // → listing.latest_round_price
  status: string; // → listing.status (LIVE/EXIT/W/O)
  fundIds: string[]; // 이 회사를 보유한 Bubble 펀드 _id (holding_funds.bubble_id 매칭용)
  fundNames: string[]; // 이 회사를 보유한 Bubble 펀드명(소속 운용펀드 매칭용)
};

function str(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t === "" ? null : t;
}

function nnum(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

// 조합 현황 화면용 — 조합 + 그 조합이 보유한 포트폴리오 회사 목록.
export type ErpPortfolioCompany = {
  id: string;
  nameKr: string;
  nameEn: string | null;
  status: string;
  sectorRaw: string | null;
};

export type ErpFundWithPortfolio = BubbleFund & {
  companies: ErpPortfolioCompany[];
};

function normFund(r: Record<string, unknown>): BubbleFund {
  return {
    id: String(r._id ?? ""),
    name: str(r["fund name"]) ?? "(이름 없음)",
    size: nnum(r["fund size"]),
    currency: str(r["currency"]),
    startDate: str(r["fund start date"]),
    endDate: str(r["fund end date"]),
  };
}

// Bubble 영문 섹터 → 우리 SECTOR_OPTIONS(한국어) best-effort 매핑.
// 토큰 단위로 분해해 매칭(부분문자열 매칭 시 "entertainment"에 "ai"가 잡히는 등
// 오탐 발생). 매칭 실패 시 null(폼에서 사용자가 직접 선택).
function mapSector(raw: string | null): string | null {
  if (!raw) return null;
  const tokens = raw.toLowerCase().split(/[^a-z0-9가-힣]+/).filter(Boolean);
  // 토큰이 키워드를 포함하면 매칭(긴 키워드는 부분일치 허용, 짧은 건 토큰 동등).
  const tokHas = (...keys: string[]) =>
    keys.some((k) =>
      tokens.some((t) => (k.length <= 3 ? t === k : t.includes(k))),
    );
  // 콘텐츠/스포츠가 함께 오는 "Entertainment/Media/Sports" 같은 복합 카테고리는
  // 콘텐츠/예술로 우선 매핑(피트니스보다 먼저 확인).
  if (tokHas("entertainment", "media", "content", "art", "music"))
    return "콘텐츠/예술";
  if (tokHas("fintech", "finance", "insurance", "bank")) return "금융/보험/핀테크";
  if (tokHas("commerce", "ecommerce", "retail")) return "커머스";
  if (tokHas("health", "healthcare", "bio", "medical", "pharma"))
    return "헬스케어/바이오";
  if (tokHas("ai", "artificial", "deeptech", "blockchain", "crypto"))
    return "AI/딥테크/블록체인";
  if (tokHas("education", "edtech", "edu")) return "교육";
  if (tokHas("game", "gaming")) return "게임";
  if (tokHas("mobility", "transport", "automotive")) return "모빌리티/교통";
  if (tokHas("food", "agriculture", "agtech")) return "푸드/농업";
  if (tokHas("fashion", "apparel")) return "패션";
  if (tokHas("beauty", "cosmetic")) return "뷰티/화장품";
  if (tokHas("logistics", "supply")) return "물류";
  if (tokHas("estate", "construction", "proptech")) return "부동산/건설";
  if (tokHas("travel", "leisure", "tourism")) return "여행/레저";
  if (tokHas("energy", "environment", "climate")) return "환경/에너지";
  if (tokHas("social", "community")) return "소셜미디어/커뮤니티";
  if (tokHas("manufacturing", "hardware", "robotics")) return "제조/하드웨어";
  if (tokHas("security", "data", "telecom", "communication"))
    return "통신/보안/데이터";
  if (tokHas("legal", "saas", "b2b", "hr")) return "인사/비즈니스/법률";
  if (tokHas("kids", "baby", "maternity", "parenting")) return "유아/출산";
  if (tokHas("home", "pet", "living", "furniture")) return "홈리빙/펫";
  if (tokHas("fitness", "sports", "sport")) return "피트니스/스포츠";
  if (tokHas("marketing", "advertising")) return "광고/마케팅";
  return null;
}

function mapStatus(raw: string | null): string {
  if (!raw) return "LIVE";
  const s = raw.toLowerCase();
  if (s.includes("written")) return "W/O";
  if (s.includes("exit")) return "EXIT";
  return "LIVE";
}

// ---- 공개 조회 함수 --------------------------------------------------------

/** 조합명으로 Bubble 펀드 검색(운용펀드 자동 채움용). */
export async function searchBubbleFunds(q: string): Promise<BubbleFund[]> {
  const term = q.trim().toLowerCase();
  if (term.length < 1) return [];
  const rows = await fetchAll("fund");
  return rows
    .filter((r) => {
      const a = (str(r["fund name"]) ?? "").toLowerCase();
      const b = (str(r["fund name for search"]) ?? "").toLowerCase();
      return a.includes(term) || b.includes(term);
    })
    .map(normFund)
    .filter((f) => f.id)
    .slice(0, 10);
}

/** 회사명(국·영문)으로 Bubble 포트폴리오 검색(매물 자동 채움용). */
export async function searchBubbleCompanies(q: string): Promise<BubbleCompany[]> {
  const term = q.trim().toLowerCase();
  if (term.length < 1) return [];

  const [companyRows, fundRows] = await Promise.all([
    fetchAll("company"),
    fetchAll("fund"),
  ]);

  const fundNameById = new Map<string, string>();
  for (const f of fundRows.map(normFund)) {
    if (f.id) fundNameById.set(f.id, f.name);
  }

  const matched = companyRows.filter((r) => {
    const fields = [
      str(r["company name"]),
      str(r["company name eng"]),
      str(r["company name for search"]),
      str(r["company name for search (eng)"]),
    ];
    return fields.some((v) => v && v.toLowerCase().includes(term));
  });

  return mapCompanies(matched.slice(0, 12), fundNameById);
}

function mapCompanies(
  rows: Record<string, unknown>[],
  fundNameById: Map<string, string>,
): BubbleCompany[] {
  return rows.map((r) => {
    const sectorArr = Array.isArray(r["sector"]) ? (r["sector"] as unknown[]) : [];
    const sectorRaw = sectorArr.length ? String(sectorArr[0]) : null;
    const fundTypeIds = Array.isArray(r["fund type"])
      ? (r["fund type"] as unknown[]).map((x) => String(x))
      : [];
    return {
      id: String(r._id ?? ""),
      nameKr: str(r["company name"]) ?? "(이름 없음)",
      nameEn: str(r["company name eng"]),
      sector: mapSector(sectorRaw),
      sectorRaw,
      lastRoundType: str(r["last round type"]),
      sharePrice: nnum(r["share price"]),
      status: mapStatus(str(r["company investment status"])),
      fundIds: fundTypeIds,
      fundNames: fundTypeIds
        .map((id) => fundNameById.get(id))
        .filter((n): n is string => Boolean(n)),
    };
  });
}

// 회사별 "최신 분기현황의 주당 단가". company.share price 가 0/미입력인 회사가
// 절반쯤이라(160/338), 분기현황(quarterlyupdate)의 latest share price 를 폴백으로
// 병합하면 최신 단가 커버리지가 늘어난다(→208/338). 회사별 최신 분기부터
// 역순으로 양수 단가를 찾는다.
const QUARTER_ORD: Record<string, number> = {
  "1분기": 1,
  "2분기": 2,
  "3분기": 3,
  "4분기": 4,
};
async function getLatestSharePriceByCompany(): Promise<Map<string, number>> {
  const rows = await fetchAll("quarterlyupdate");
  const byCompany = new Map<string, Record<string, unknown>[]>();
  for (const r of rows) {
    const c = str(r["company"]);
    if (!c) continue;
    const list = byCompany.get(c);
    if (list) list.push(r);
    else byCompany.set(c, [r]);
  }
  const out = new Map<string, number>();
  for (const [c, list] of byCompany) {
    list.sort((a, b) => {
      const ya = nnum(a["year"]) ?? 0;
      const yb = nnum(b["year"]) ?? 0;
      if (ya !== yb) return ya - yb;
      return (
        (QUARTER_ORD[String(a["quarter"])] ?? 0) -
        (QUARTER_ORD[String(b["quarter"])] ?? 0)
      );
    });
    for (let i = list.length - 1; i >= 0; i--) {
      const p =
        nnum(list[i]["latest share price"]) ?? nnum(list[i]["share price"]) ?? 0;
      if (p > 0) {
        out.set(c, p);
        break;
      }
    }
  }
  return out;
}

/** ERP 전체 포트폴리오(제자리 동기화 매칭 소스). */
export async function getAllBubbleCompanies(): Promise<BubbleCompany[]> {
  const [companyRows, fundRows, qPriceByCompany] = await Promise.all([
    fetchAll("company"),
    fetchAll("fund"),
    getLatestSharePriceByCompany(),
  ]);
  const fundNameById = new Map<string, string>();
  for (const f of fundRows.map(normFund)) {
    if (f.id) fundNameById.set(f.id, f.name);
  }
  return mapCompanies(companyRows, fundNameById)
    .filter((c) => c.id)
    .map((c) =>
      // company.share price 가 비어있으면 최신 분기현황 단가로 폴백.
      c.sharePrice && c.sharePrice > 0
        ? c
        : { ...c, sharePrice: qPriceByCompany.get(c.id) ?? c.sharePrice },
    );
}

/** ERP 전체 조합(일괄 동기화 소스). */
export async function getAllBubbleFunds(): Promise<BubbleFund[]> {
  const rows = await fetchAll("fund");
  return rows.map(normFund).filter((f) => f.id);
}

/** 조합 현황 화면용 — 전체 조합 + 각 조합이 보유한 포트폴리오 회사. */
export async function getErpFundsWithPortfolio(): Promise<
  ErpFundWithPortfolio[]
> {
  const [fundRows, companyRows] = await Promise.all([
    fetchAll("fund"),
    fetchAll("company"),
  ]);

  const byFund = new Map<string, ErpPortfolioCompany[]>();
  for (const r of companyRows) {
    const ids = Array.isArray(r["fund type"])
      ? (r["fund type"] as unknown[]).map((x) => String(x))
      : [];
    const sectorArr = Array.isArray(r["sector"]) ? (r["sector"] as unknown[]) : [];
    const company: ErpPortfolioCompany = {
      id: String(r._id ?? ""),
      nameKr: str(r["company name"]) ?? "(이름 없음)",
      nameEn: str(r["company name eng"]),
      status: mapStatus(str(r["company investment status"])),
      sectorRaw: sectorArr.length ? String(sectorArr[0]) : null,
    };
    for (const fid of ids) {
      const list = byFund.get(fid);
      if (list) list.push(company);
      else byFund.set(fid, [company]);
    }
  }

  return getAllFundsSorted(fundRows).map((f) => ({
    ...f,
    companies: (byFund.get(f.id) ?? []).sort((a, b) =>
      a.nameKr.localeCompare(b.nameKr, "ko"),
    ),
  }));
}

function getAllFundsSorted(fundRows: Record<string, unknown>[]): BubbleFund[] {
  return fundRows
    .map(normFund)
    .filter((f) => f.id)
    .sort((a, b) => a.name.localeCompare(b.name, "ko"));
}
