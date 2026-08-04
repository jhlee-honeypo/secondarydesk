// ERP(sparkERP/Bubble) 제자리 동기화 핵심 로직. 서버 액션(listings/sync-actions.ts)과
// 크론 라우트(api/cron/erp-sync) 양쪽에서 공유한다. "use server" 가 아니므로
// 직렬화 불가한 Supabase 클라이언트를 인자로 받을 수 있다(쿠키 세션 / service-role).
import type { createServerClient } from "@supabase/ssr";
import { revalidatePath } from "next/cache";

import {
  getAllBubbleCompanies,
  getAllBubbleFunds,
  getAllBubbleInvestments,
  mapStatus,
  type BubbleCompany,
  type BubbleFund,
  type BubbleInvestment,
} from "@/lib/bubble";

// createClient(쿠키)·createAdminClient(service-role) 둘 다 createServerClient 로
// 만들어지므로 반환 타입이 동일하다.
export type SyncClient = ReturnType<typeof createServerClient>;

// 회사/조합명 정규화 — ㈜·(주)·주식회사·공백·구두점을 제거해 수기 입력과 ERP 명을 매칭.
export function norm(s: string | null | undefined): string {
  return (s ?? "")
    .toLowerCase()
    .replace(/주식회사|유한회사/g, "")
    .replace(/㈜/g, "")
    .replace(/\((주|유)\)/g, "")
    .replace(/[^a-z0-9가-힣]/g, "");
}

export function isoToKstDate(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return new Date(d.getTime() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

export type ExistingFund = {
  id: string;
  name: string;
  short_name: string | null;
  bubble_id: string | null;
};
export type ExistingListing = {
  id: string;
  company_name: string;
  company_name_en: string | null;
  sector: string | null;
  stage: string | null;
  latest_round_price: number | null;
  status: string;
  bubble_id: string | null;
  listing_funds: { holding_fund_id: string }[];
};

// ERP 투자상태(LIVE/EXIT/W/O)를 매물 상태로 반영하되, 수동 영업값인
// "ON SALE"(매각 진행 중)은 보존한다. erpStatus 는 bubble.mapStatus 로 이미
// LIVE/EXIT/W/O 로 매핑된 값.
export function resolveListingStatus(current: string, erpStatus: string): string {
  return current === "ON SALE" ? current : erpStatus;
}

// 한 펀드가 같은 회사에 여러 회차 투자한 경우의 대표 취급상태 —
// 한 회차라도 살아있으면 LIVE, 없으면 EXIT, 전부 상각이면 W/O.
// (slab-bot getPositionStatusByCompany 와 동일 규칙이라 두 앱 답이 일치한다.)
// 상태 원문이 빈 투자건은 판단 근거가 없어 제외하며, 전부 비면 null(=모름).
export function aggregatePosition(statuses: (string | null)[]): string | null {
  const mapped = statuses.filter((s): s is string => Boolean(s)).map(mapStatus);
  if (!mapped.length) return null;
  if (mapped.includes("LIVE")) return "LIVE";
  if (mapped.includes("EXIT")) return "EXIT";
  return "W/O";
}

// ERP 투자내역을 회사별·(회사,ERP펀드)별 상태 원문으로 색인.
export function indexInvestments(investments: BubbleInvestment[]) {
  const byCompany = new Map<string, (string | null)[]>();
  const byCompanyFund = new Map<string, (string | null)[]>();
  for (const inv of investments) {
    if (!inv.company) continue;
    const c = byCompany.get(inv.company);
    if (c) c.push(inv.status);
    else byCompany.set(inv.company, [inv.status]);
    // 펀드 미지정 투자건은 펀드별 집계에 넣을 수 없어 회사 집계에만 반영.
    if (!inv.fundId) continue;
    const k = `${inv.company} ${inv.fundId}`;
    const cf = byCompanyFund.get(k);
    if (cf) cf.push(inv.status);
    else byCompanyFund.set(k, [inv.status]);
  }
  return { byCompany, byCompanyFund };
}

// ERP fund ↔ 기존 holding_funds 매칭. ERP 펀드명은 약칭(예: SKF3)이고
// SecondaryDesk 는 상세 명칭이라, bubble_id → 약칭(short_name) → 상세명 순으로 매칭.
export function matchFund(
  erp: BubbleFund,
  existing: ExistingFund[],
): ExistingFund | undefined {
  const e = norm(erp.name);
  return (
    existing.find((x) => x.bubble_id && x.bubble_id === erp.id) ??
    existing.find((x) => x.short_name && norm(x.short_name) === e) ??
    existing.find((x) => norm(x.name) === e)
  );
}

// ERP company ↔ 기존 listing 매칭(bubble_id 우선, 없으면 국문/영문명).
export function matchListing(
  lst: ExistingListing,
  companies: BubbleCompany[],
): BubbleCompany | undefined {
  if (lst.bubble_id) {
    const byId = companies.find((c) => c.id === lst.bubble_id);
    if (byId) return byId;
  }
  const ln = norm(lst.company_name);
  const len = norm(lst.company_name_en);
  return companies.find(
    (c) =>
      norm(c.nameKr) === ln ||
      (c.nameEn && norm(c.nameEn) === ln) ||
      (len && (norm(c.nameKr) === len || (c.nameEn && norm(c.nameEn) === len))),
  );
}

export type ApplyResult =
  | {
      ok: true;
      fundsCreated: number;
      fundsUpdated: number;
      listingsUpdated: number;
      fundLinksAdded: number;
      positionsUpdated: number; // 취급상태를 채운 매물×펀드 링크 수
    }
  | { ok: false; error: string };

// 제자리 동기화 적용 — 매칭된 기존 펀드/매물만 ERP 사실로 갱신(신규 매물 생성 안 함).
// 영업값(약칭·상태·메모·자료링크)은 보존한다. 호출자가 만든 Supabase 클라이언트를
// 받아 쓴다(서버 액션=쿠키 세션 / 크론=service-role).
export async function runErpSync(supabase: SyncClient): Promise<ApplyResult> {
  let erpFunds: BubbleFund[];
  let erpCompanies: BubbleCompany[];
  let erpInvestments: BubbleInvestment[];
  try {
    [erpFunds, erpCompanies, erpInvestments] = await Promise.all([
      getAllBubbleFunds(),
      getAllBubbleCompanies(),
      getAllBubbleInvestments(),
    ]);
  } catch {
    return { ok: false, error: "ERP 데이터를 불러오지 못했습니다." };
  }
  const { byCompany: invByCompany, byCompanyFund: invByCompanyFund } =
    indexInvestments(erpInvestments);

  // 1) 운용펀드 동기화(신규 생성 + 매칭 갱신) — 영업값(약칭/상태/메모) 보존.
  const { data: fundRows, error: fundReadErr } = await supabase
    .from("holding_funds")
    .select("id, name, short_name, bubble_id");
  if (fundReadErr) return { ok: false, error: fundReadErr.message };
  const existingFunds = (fundRows ?? []) as ExistingFund[];

  let fundsCreated = 0;
  let fundsUpdated = 0;
  for (const erp of erpFunds) {
    const facts = {
      commitment: erp.size,
      vintage: erp.startDate
        ? Number(isoToKstDate(erp.startDate)?.slice(0, 4)) || null
        : null,
      maturity_date: isoToKstDate(erp.endDate),
      bubble_id: erp.id,
    };
    const m = matchFund(erp, existingFunds);
    if (m) {
      // 매칭 시 상세 명칭(name)·약칭(short_name)은 보존하고 ERP 사실만 갱신.
      const { error } = await supabase
        .from("holding_funds")
        .update(facts)
        .eq("id", m.id);
      if (error) return { ok: false, error: error.message };
      fundsUpdated++;
    } else {
      // 신규 펀드는 ERP 코드를 명칭·약칭으로 함께 넣어둔다(이후 수정 가능).
      const { error } = await supabase
        .from("holding_funds")
        .insert({ ...facts, name: erp.name, short_name: erp.name });
      if (error) return { ok: false, error: error.message };
      fundsCreated++;
    }
  }

  // 2) 매물 보정 — 매칭된 기존 매물만 ERP 사실로 갱신(신규 생성 안 함).
  //    holding_funds.bubble_id → holding_fund_id 매핑(방금 동기화돼 채워짐).
  const { data: freshFunds, error: freshFundErr } = await supabase
    .from("holding_funds")
    .select("id, bubble_id");
  if (freshFundErr) return { ok: false, error: freshFundErr.message };
  const holdingIdByBubble = new Map<string, string>();
  const bubbleByHoldingId = new Map<string, string>();
  for (const f of (freshFunds ?? []) as { id: string; bubble_id: string | null }[]) {
    if (f.bubble_id) {
      holdingIdByBubble.set(f.bubble_id, f.id);
      bubbleByHoldingId.set(f.id, f.bubble_id);
    }
  }

  const { data: listingRows, error: lstReadErr } = await supabase
    .from("listings")
    .select(
      "id, company_name, company_name_en, sector, stage, latest_round_price, status, bubble_id, listing_funds(holding_fund_id)",
    );
  if (lstReadErr) return { ok: false, error: lstReadErr.message };
  const existingListings = (listingRows ?? []) as ExistingListing[];

  let listingsUpdated = 0;
  let fundLinksAdded = 0;
  // 매물×펀드 취급상태 — 루프에서 모아 마지막에 한 번 upsert 한다(요청 수 절약).
  const linkRows: {
    listing_id: string;
    holding_fund_id: string;
    position_status: string | null;
  }[] = [];
  // bubble_id 는 UNIQUE 라 한 ERP 회사는 매물 1건에만 연결돼야 한다.
  // 어떤 매물이 이미 그 회사를 소유 중인지 DB 상태로 먼저 파악(ownerByCompany).
  // 이름으로 매칭됐더라도 그 회사가 다른 매물 소유면 건너뛴다(유니크 위반 방지).
  // 처리 순서와 무관하게 안전하다.
  const ownerByCompany = new Map<string, string>();
  for (const l of existingListings) {
    if (l.bubble_id) ownerByCompany.set(l.bubble_id, l.id);
  }
  for (const lst of existingListings) {
    const c = matchListing(lst, erpCompanies);
    if (!c) continue;
    const owner = ownerByCompany.get(c.id);
    if (owner && owner !== lst.id) continue; // 다른 매물이 이미 이 회사 소유
    ownerByCompany.set(c.id, lst.id); // 소유 확정(이후 매물이 같은 회사 매칭 시 차단)

    // 회사 전체 취급상태 = 이 회사에 대한 우리 포지션 전체의 집계.
    // slab 의 회사 존속상태(c.status)는 우리 포지션과 무관하게 Live 로 남는 경우가
    // 많아, 투자내역이 있으면 그쪽을 쓰고 없을 때만 회사 상태로 폴백한다.
    const rollup = aggregatePosition(invByCompany.get(c.id) ?? []);

    // ERP 사실만 덮고, 비어있지 않으면 보존(영업상태·자료링크는 애초에 안 건드림).
    const fields = {
      company_name: c.nameKr || lst.company_name,
      company_name_en: c.nameEn ?? lst.company_name_en,
      sector: c.sector ?? lst.sector,
      stage: c.lastRoundType ?? lst.stage,
      latest_round_price:
        c.sharePrice && c.sharePrice > 0
          ? c.sharePrice
          : lst.latest_round_price,
      // ERP 투자상태를 반영(LIVE/EXIT/W/O), 단 "ON SALE"은 영업값이라 보존.
      status: resolveListingStatus(lst.status, rollup ?? c.status),
      bubble_id: c.id,
    };
    const { error: updErr } = await supabase
      .from("listings")
      .update(fields)
      .eq("id", lst.id);
    if (updErr) return { ok: false, error: updErr.message };
    listingsUpdated++;

    // 소속 운용펀드 — ERP 보유 펀드를 병합(기존 수기 태그는 보존, 누락분만 추가).
    const already = new Set(lst.listing_funds.map((lf) => lf.holding_fund_id));
    const toAdd = c.fundIds
      .map((fid) => holdingIdByBubble.get(fid))
      .filter((id): id is string => Boolean(id) && !already.has(id!));
    const uniqueToAdd = Array.from(new Set(toAdd));
    fundLinksAdded += uniqueToAdd.length;

    // 각 링크의 취급상태 — 그 펀드가 이 회사에 넣은 투자건들의 집계.
    // 기존 링크 중 ERP 투자내역이 없는 것(수기 태그)은 상태를 지우지 않고 건너뛴다.
    for (const holdingFundId of [...already, ...uniqueToAdd]) {
      const erpFundId = bubbleByHoldingId.get(holdingFundId);
      const position = erpFundId
        ? aggregatePosition(invByCompanyFund.get(`${c.id} ${erpFundId}`) ?? [])
        : null;
      if (position === null && already.has(holdingFundId)) continue;
      linkRows.push({
        listing_id: lst.id,
        holding_fund_id: holdingFundId,
        position_status: position,
      });
    }
  }

  if (linkRows.length) {
    const { error: linkErr } = await supabase
      .from("listing_funds")
      .upsert(linkRows, { onConflict: "listing_id,holding_fund_id" });
    if (linkErr) return { ok: false, error: linkErr.message };
  }

  revalidatePath("/listings");
  revalidatePath("/funds");
  revalidatePath("/funds/erp");
  revalidatePath("/financials");
  revalidatePath("/funds/sync");
  return {
    ok: true,
    fundsCreated,
    fundsUpdated,
    listingsUpdated,
    fundLinksAdded,
    positionsUpdated: linkRows.length,
  };
}
