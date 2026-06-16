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
  sector: string | null; // slab 섹터 원문(SECTOR_OPTIONS 와 동일 택소노미) → listing.sector
  sectorRaw: string | null; // Bubble 원문(참고 표시용, sector 와 동일)
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
      sector: sectorRaw,
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

// ---- 우리(스파크랩) 투자내역 (EXIT 시나리오 자동채움 소스) -----------------

export type BubbleInvestment = {
  company: string; // sparkERP company _id (매물 매칭용)
  fundId: string | null; // sparkERP fund _id (운용펀드 매칭용)
  amount: number; // 투자금액(원) = total amount
  shares: number; // 보유 주식수 = share
  unitPrice: number; // 투자 단가 = amount ÷ shares (역산, 정수 반올림)
  status: string | null; // investment status (Live / Written-off 등)
};

function normInvestment(r: Record<string, unknown>): BubbleInvestment {
  const amount = nnum(r["total amount"]) ?? 0;
  const shares = nnum(r["share"]) ?? 0;
  return {
    company: str(r["company"]) ?? "",
    fundId: str(r["fund"]),
    amount,
    shares,
    unitPrice: shares > 0 ? Math.round(amount / shares) : 0,
    status: str(r["investment status"]),
  };
}

/** 특정 포트폴리오 회사(company _id)에 대한 우리 투자내역(sparklabinvestment).
 *  한 건이 한 라운드(투자 회차)에 대응. 단가는 total amount ÷ share 로 역산하며
 *  share 가 없으면 단가 0(자동채움 단계에서 거른다). */
export async function getBubbleInvestmentsByCompany(
  companyId: string,
): Promise<BubbleInvestment[]> {
  if (!companyId) return [];
  const rows = await fetchAll("sparklabinvestment");
  return rows.map(normInvestment).filter((x) => x.company === companyId);
}

/** ERP 전체 투자내역(일괄 자동채움 소스). */
export async function getAllBubbleInvestments(): Promise<BubbleInvestment[]> {
  const rows = await fetchAll("sparklabinvestment");
  return rows.map(normInvestment).filter((x) => x.company);
}

// ---- 매물 상세 ERP 개요(주식정보·스파크랩 투자·후속투자) --------------------
// 회사 1건 분량이라 전체 fetch 대신 Bubble constraints(서버측 정확일치 필터)로
// 해당 회사 레코드만 받아 빠르게 조회한다.

async function fetchByField(
  type: string,
  key: string,
  value: string,
): Promise<Record<string, unknown>[]> {
  const params = new URLSearchParams();
  params.set(
    "constraints",
    JSON.stringify([{ key, constraint_type: "equals", value }]),
  );
  params.set("limit", "100");
  const url = `${BASE}/api/1.1/obj/${type}?${params.toString()}`;
  const headers: Record<string, string> = {};
  if (TOKEN) headers.Authorization = `Bearer ${TOKEN}`;
  const res = await fetch(url, { headers, cache: "no-store" });
  if (!res.ok) throw new Error(`Bubble ${type} ${res.status}`);
  const json = (await res.json()) as BubbleListResponse;
  return json.response?.results ?? [];
}

export type ErpStockInfo = {
  valuation: number | null; // 기업가치 = 주당가격 × 발행주식총수
  lastRoundType: string | null; // 마지막 투자라운드
  lastInvestDate: string | null; // 마지막 투자유치일(ISO)
  sharesOutstanding: number | null; // 발행주식총수
  sharePrice: number | null; // 주당가격
  shareCurrency: string | null;
  investmentStatus: string | null;
};

export type ErpInvestment = {
  fundId: string | null; // sparkERP fund _id
  amount: number; // 투자금액(원)
  shares: number; // 보유 주식수
  unitPrice: number; // 단가(역산)
  shareRatio: number | null; // 지분율(%)
  status: string | null; // Live / Written-off 등
};

export type ErpFundingRound = {
  year: number | null;
  quarter: string | null;
  series: string | null; // funding series
  amountRaised: number | null; // total amount raised
  sharePrice: number | null;
  issuedShares: number | null;
  endDate: string | null; // funding end date(ISO)
};

export type ErpCompanyOverview = {
  found: boolean;
  stock: ErpStockInfo;
  investments: ErpInvestment[];
  fundingRounds: ErpFundingRound[];
};

const EMPTY_OVERVIEW: ErpCompanyOverview = {
  found: false,
  stock: {
    valuation: null,
    lastRoundType: null,
    lastInvestDate: null,
    sharesOutstanding: null,
    sharePrice: null,
    shareCurrency: null,
    investmentStatus: null,
  },
  investments: [],
  fundingRounds: [],
};

/** 매물 상세용 — sparkERP 회사(_id)의 주식정보·스파크랩 투자·후속투자 묶음. */
export async function getErpCompanyOverview(
  companyId: string,
): Promise<ErpCompanyOverview> {
  if (!companyId) return EMPTY_OVERVIEW;

  const [companyRows, quarterRows, invRows] = await Promise.all([
    fetchByField("company", "_id", companyId),
    fetchByField("quarterlyupdate", "company", companyId),
    fetchByField("sparklabinvestment", "company", companyId),
  ]);

  const company = companyRows[0];
  if (!company) return EMPTY_OVERVIEW;

  // 분기현황을 최신순 정렬(연도 desc, 분기 desc)
  const quarters = [...quarterRows].sort((a, b) => {
    const yb = (nnum(b["year"]) ?? 0) - (nnum(a["year"]) ?? 0);
    if (yb !== 0) return yb;
    return (
      (QUARTER_ORD[String(b["quarter"])] ?? 0) -
      (QUARTER_ORD[String(a["quarter"])] ?? 0)
    );
  });
  // 최신 분기부터 첫 양수값을 채택(분기마다 일부 필드만 채워짐).
  const latest = (key: string): number | null => {
    for (const q of quarters) {
      const v = nnum(q[key]);
      if (v && v > 0) return v;
    }
    return null;
  };

  const sharePrice = latest("latest share price") ?? nnum(company["share price"]);
  const sharesOutstanding =
    latest("latest issued share outstanding") ??
    nnum(company["share outstanding"]);
  const valuation =
    sharePrice && sharesOutstanding ? sharePrice * sharesOutstanding : null;

  const fundingRounds: ErpFundingRound[] = quarters
    .filter(
      (q) =>
        String(q["any new funding round?"] ?? "").toLowerCase() === "done" ||
        str(q["funding series"]) ||
        nnum(q["total amount raised"]),
    )
    .map((q) => ({
      year: nnum(q["year"]),
      quarter: str(q["quarter"]),
      series: str(q["funding series"]),
      amountRaised: nnum(q["total amount raised"]),
      sharePrice: nnum(q["share price"]),
      issuedShares: nnum(q["issued share outstanding"]),
      endDate: str(q["funding end date"]),
    }));

  const investments: ErpInvestment[] = invRows.map((r) => {
    const inv = normInvestment(r);
    return {
      fundId: inv.fundId,
      amount: inv.amount,
      shares: inv.shares,
      unitPrice: inv.unitPrice,
      shareRatio: nnum(r["share ratio"]),
      status: inv.status,
    };
  });

  return {
    found: true,
    stock: {
      valuation,
      lastRoundType: str(company["last round type"]),
      lastInvestDate: str(company["last invest date"]),
      sharesOutstanding,
      sharePrice,
      shareCurrency: str(company["share currency"]),
      investmentStatus: str(company["company investment status"]),
    },
    investments,
    fundingRounds,
  };
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
