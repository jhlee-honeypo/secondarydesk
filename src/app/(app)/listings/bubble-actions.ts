"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import {
  getAllBubbleFunds,
  getAllBubbleInvestments,
  getBubbleInvestmentsByCompany,
  searchBubbleCompanies,
  searchBubbleFunds,
  type BubbleCompany,
  type BubbleFund,
  type BubbleInvestment,
} from "@/lib/bubble";
import type { RoundSeed } from "./_components/rounds-editor";

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// 클라이언트 폼(운용펀드/매물)에서 호출하는 Bubble 온디맨드 조회 래퍼.
// Bubble 가 비활성/오류여도 폼이 죽지 않도록 try/catch 로 빈 배열을 반환한다.

export async function lookupBubbleFunds(q: string): Promise<BubbleFund[]> {
  try {
    return await searchBubbleFunds(q);
  } catch {
    return [];
  }
}

export async function lookupBubbleCompanies(
  q: string,
): Promise<BubbleCompany[]> {
  try {
    return await searchBubbleCompanies(q);
  } catch {
    return [];
  }
}

/** sparkERP 투자내역(sparklabinvestment)을 매물의 투자 라운드(RoundSeed)로 변환.
 *  단가 역산 가능(주식수·금액 모두 양수)한 건만 포함하고, sparkERP fund _id 를
 *  우리 운용펀드(holding_funds.bubble_id)로 매핑해 소속 펀드를 자동 지정한다. */
export async function lookupBubbleInvestments(
  companyBubbleId: string | null,
): Promise<RoundSeed[]> {
  if (!companyBubbleId) return [];
  try {
    const supabase = await createClient();
    const [investments, { data: fundRows }] = await Promise.all([
      getBubbleInvestmentsByCompany(companyBubbleId),
      supabase.from("holding_funds").select("id, bubble_id"),
    ]);
    const fundIdByBubbleId = new Map<string, string>();
    for (const f of (fundRows ?? []) as {
      id: string;
      bubble_id: string | null;
    }[]) {
      if (f.bubble_id) fundIdByBubbleId.set(f.bubble_id, f.id);
    }
    return investments
      .filter((inv) => inv.shares > 0 && inv.amount > 0)
      .map((inv) => ({
        label: null,
        unit_price: inv.unitPrice,
        shares: inv.shares,
        amount: inv.amount,
        holding_fund_id: inv.fundId
          ? fundIdByBubbleId.get(inv.fundId) ?? null
          : null,
      }));
  } catch {
    return [];
  }
}

export type BulkInvestmentResult =
  | {
      ok: true;
      listingsUpdated: number; // 라운드를 채운 매물 수
      roundsCreated: number; // 새로 기록한 라운드(투자 회차) 총수
      fundTagsAdded: number; // 자동 태깅된 (매물,운용펀드) 연결 수
      skipped: number; // ERP 매칭됐으나 투자내역이 없어 건너뛴 매물 수
    }
  | { ok: false; error: string };

/** ERP 매칭된(bubble_id 보유) 매물 전체에 대해 sparkERP 투자내역을 일괄로
 *  EXIT 라운드(exit_scenario_rounds)에 채운다. 투자내역이 있는 매물만 기존
 *  라운드를 ERP 값으로 교체하고(없는 매물은 손대지 않아 수기 입력 보존),
 *  매핑된 운용펀드를 listing_funds 에 자동 태깅한다(중복 제외). */
export async function syncAllListingInvestments(): Promise<BulkInvestmentResult> {
  let investments: BubbleInvestment[];
  try {
    investments = await getAllBubbleInvestments();
  } catch {
    return { ok: false, error: "sparkERP 투자내역을 불러오지 못했습니다." };
  }

  const supabase = await createClient();
  const [{ data: listingRows, error: lErr }, { data: fundRows }, { data: lfRows }] =
    await Promise.all([
      supabase.from("listings").select("id, bubble_id").not("bubble_id", "is", null),
      supabase.from("holding_funds").select("id, bubble_id"),
      supabase.from("listing_funds").select("listing_id, holding_fund_id"),
    ]);
  if (lErr) return { ok: false, error: lErr.message };

  // sparkERP fund _id → 우리 운용펀드 id
  const fundIdByBubbleId = new Map<string, string>();
  for (const f of (fundRows ?? []) as { id: string; bubble_id: string | null }[]) {
    if (f.bubble_id) fundIdByBubbleId.set(f.bubble_id, f.id);
  }
  // 이미 연결된 (매물,펀드) 쌍 — 중복 태깅 방지
  const existingTags = new Set<string>();
  for (const lf of (lfRows ?? []) as {
    listing_id: string;
    holding_fund_id: string;
  }[]) {
    existingTags.add(`${lf.listing_id}:${lf.holding_fund_id}`);
  }
  // 회사 _id → 투자내역(역산 가능 건만)
  const byCompany = new Map<string, BubbleInvestment[]>();
  for (const inv of investments) {
    if (inv.shares > 0 && inv.amount > 0) {
      const list = byCompany.get(inv.company);
      if (list) list.push(inv);
      else byCompany.set(inv.company, [inv]);
    }
  }

  const listings = (listingRows ?? []) as { id: string; bubble_id: string | null }[];
  const targetListingIds: string[] = [];
  const roundRows: Record<string, unknown>[] = [];
  const tagRows: { listing_id: string; holding_fund_id: string }[] = [];
  let skipped = 0;

  for (const lst of listings) {
    const invs = lst.bubble_id ? byCompany.get(lst.bubble_id) : undefined;
    if (!invs || invs.length === 0) {
      skipped++;
      continue;
    }
    targetListingIds.push(lst.id);
    invs.forEach((inv, i) => {
      const holdingFundId = inv.fundId
        ? fundIdByBubbleId.get(inv.fundId) ?? null
        : null;
      roundRows.push({
        listing_id: lst.id,
        round_no: i + 1,
        label: null,
        amount: inv.amount,
        unit_price: inv.unitPrice,
        shares: inv.shares,
        holding_fund_id: holdingFundId,
      });
      if (holdingFundId && !existingTags.has(`${lst.id}:${holdingFundId}`)) {
        existingTags.add(`${lst.id}:${holdingFundId}`); // 같은 매물 내 중복 방지
        tagRows.push({ listing_id: lst.id, holding_fund_id: holdingFundId });
      }
    });
  }

  if (targetListingIds.length === 0) {
    return { ok: true, listingsUpdated: 0, roundsCreated: 0, fundTagsAdded: 0, skipped };
  }

  // 기존 라운드 교체: 대상 매물의 라운드 삭제(URL 길이 한도 회피 위해 100개씩)
  for (const ids of chunk(targetListingIds, 100)) {
    const { error } = await supabase
      .from("exit_scenario_rounds")
      .delete()
      .in("listing_id", ids);
    if (error) return { ok: false, error: error.message };
  }
  // 새 라운드 / 펀드 태그 일괄 삽입(500건씩)
  for (const rows of chunk(roundRows, 500)) {
    const { error } = await supabase.from("exit_scenario_rounds").insert(rows);
    if (error) return { ok: false, error: error.message };
  }
  for (const rows of chunk(tagRows, 500)) {
    const { error } = await supabase.from("listing_funds").insert(rows);
    if (error) return { ok: false, error: error.message };
  }

  revalidatePath("/listings");
  revalidatePath("/exit-scenario");
  return {
    ok: true,
    listingsUpdated: targetListingIds.length,
    roundsCreated: roundRows.length,
    fundTagsAdded: tagRows.length,
    skipped,
  };
}

// ISO 일시 → KST 달력 날짜(YYYY-MM-DD). Bubble 날짜는 UTC 저장이라 +9h 보정.
function isoToKstDate(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return new Date(d.getTime() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

export type SyncResult =
  | { ok: true; created: number; updated: number }
  | { ok: false; error: string };

/** ERP 조합 전체를 운용펀드(holding_funds)로 일괄 동기화.
 *  bubble_id 로 멱등 매칭(없으면 이름) — 기존 펀드는 약정액·결성연도·만기만 갱신,
 *  약칭·상태·메모는 보존. 신규 펀드는 추가. */
export async function syncErpFunds(): Promise<SyncResult> {
  let funds: BubbleFund[];
  try {
    funds = await getAllBubbleFunds();
  } catch {
    return { ok: false, error: "ERP 조합을 불러오지 못했습니다." };
  }
  if (funds.length === 0) return { ok: true, created: 0, updated: 0 };

  const supabase = await createClient();
  const { data: existingRows, error: readErr } = await supabase
    .from("holding_funds")
    .select("id, name, bubble_id");
  if (readErr) return { ok: false, error: readErr.message };

  const norm = (s: string) => s.toLowerCase().replace(/\s+/g, "");
  const existing = (existingRows ?? []) as {
    id: string;
    name: string;
    bubble_id: string | null;
  }[];
  const byBubbleId = new Map(
    existing.filter((e) => e.bubble_id).map((e) => [e.bubble_id as string, e]),
  );
  const byName = new Map(existing.map((e) => [norm(e.name), e]));

  let created = 0;
  let updated = 0;

  for (const f of funds) {
    const fields = {
      name: f.name,
      commitment: f.size,
      vintage: f.startDate
        ? Number(isoToKstDate(f.startDate)?.slice(0, 4)) || null
        : null,
      maturity_date: isoToKstDate(f.endDate),
      bubble_id: f.id,
    };
    const match = byBubbleId.get(f.id) ?? byName.get(norm(f.name));
    if (match) {
      const { error } = await supabase
        .from("holding_funds")
        .update(fields)
        .eq("id", match.id);
      if (error) return { ok: false, error: error.message };
      updated++;
    } else {
      const { error } = await supabase.from("holding_funds").insert(fields);
      if (error) return { ok: false, error: error.message };
      created++;
    }
  }

  revalidatePath("/funds");
  revalidatePath("/listings");
  revalidatePath("/funds/erp");
  return { ok: true, created, updated };
}
