"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { getErpCompanyOverview } from "@/lib/bubble";
import type { ExitScenarioRound } from "@/lib/types";

export type ActionResult = { ok: true } | { ok: false; error: string };

// ---- 파싱 헬퍼 -------------------------------------------------------------

function text(fd: FormData, key: string): string | null {
  const v = fd.get(key);
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t === "" ? null : t;
}

function requiredText(fd: FormData, key: string): string {
  return text(fd, key) ?? "";
}

function num(fd: FormData, key: string): number | null {
  const t = text(fd, key);
  if (t === null) return null;
  const n = Number(t.replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

function intNum(fd: FormData, key: string): number | null {
  const n = num(fd, key);
  return n === null ? null : Math.trunc(n);
}

// 체크박스 그룹(같은 name 다중) → 정리된 문자열 배열
function idList(fd: FormData, key: string): string[] {
  return fd
    .getAll(key)
    .map((v) => (typeof v === "string" ? v.trim() : ""))
    .filter(Boolean);
}

// ---- 투자 라운드 (EXIT 시나리오 소스) --------------------------------------
// 매물 폼의 "투자 데이터(선택)" 섹션에서 라운드별 단가·주식수·투자액을
// parallel array(round_label[]·round_price[]·round_shares[]·round_amount[])로
// 받아 exit_scenario_rounds 와 동기화한다. 폼에 rounds_present 마커가 없으면
// (예: 수정 폼에서 라운드가 아직 로드되지 않음) 기존 데이터를 건드리지 않는다.

function digitsNum(v: FormDataEntryValue | undefined): number {
  if (typeof v !== "string") return 0;
  return Number(v.replace(/[^\d]/g, "")) || 0;
}

function entryStr(v: FormDataEntryValue | undefined): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t === "" ? null : t;
}

type RoundRow = {
  label: string | null;
  amount: number;
  unit_price: number;
  shares: number;
  holding_fund_id: string | null;
};

function parseRounds(fd: FormData): RoundRow[] {
  const labels = fd.getAll("round_label");
  const prices = fd.getAll("round_price");
  const sharesArr = fd.getAll("round_shares");
  const amounts = fd.getAll("round_amount");
  const fundIds = fd.getAll("round_fund_id");
  const n = Math.max(
    labels.length,
    prices.length,
    sharesArr.length,
    amounts.length,
    fundIds.length,
  );

  const rows: RoundRow[] = [];
  for (let i = 0; i < n; i++) {
    const unit_price = digitsNum(prices[i]);
    const shares = digitsNum(sharesArr[i]);
    const amt = digitsNum(amounts[i]);
    const amount = amt > 0 ? amt : unit_price * shares;
    if (unit_price > 0 || shares > 0 || amount > 0) {
      rows.push({
        label: entryStr(labels[i]),
        amount,
        unit_price,
        shares,
        holding_fund_id: entryStr(fundIds[i]),
      });
    }
  }
  return rows;
}

async function syncExitRounds(
  supabase: Awaited<ReturnType<typeof createClient>>,
  listingId: string,
  rounds: RoundRow[],
): Promise<string | null> {
  const { error: delErr } = await supabase
    .from("exit_scenario_rounds")
    .delete()
    .eq("listing_id", listingId);
  if (delErr) return delErr.message;

  if (rounds.length === 0) return null;

  const { error: insErr } = await supabase.from("exit_scenario_rounds").insert(
    rounds.map((r, i) => ({
      listing_id: listingId,
      round_no: i + 1,
      label: r.label,
      amount: r.amount,
      unit_price: r.unit_price,
      shares: r.shares,
      holding_fund_id: r.holding_fund_id,
    })),
  );
  return insErr?.message ?? null;
}

/** 매물의 투자 라운드 조회(수정 폼 프리필 / EXIT 시나리오 화면). */
export async function getListingRounds(listingId: string): Promise<
  | { ok: true; rounds: ExitScenarioRound[]; latestPrice: number | null }
  | { ok: false; error: string }
> {
  if (!listingId) return { ok: false, error: "잘못된 요청입니다." };
  const supabase = await createClient();
  const [{ data, error }, { data: lst }] = await Promise.all([
    supabase
      .from("exit_scenario_rounds")
      .select(
        "id, listing_id, round_no, label, amount, unit_price, shares, holding_fund_id",
      )
      .eq("listing_id", listingId)
      .order("round_no", { ascending: true }),
    supabase
      .from("listings")
      .select("latest_round_price")
      .eq("id", listingId)
      .single(),
  ]);
  if (error) return { ok: false, error: error.message };
  return {
    ok: true,
    rounds: (data ?? []) as ExitScenarioRound[],
    latestPrice: (lst?.latest_round_price ?? null) as number | null,
  };
}

// EXIT 시뮬레이터 단가 추정용 — slab(sparkERP)에서 회사 발행주식총수·주당가격을
// 끌어온다. 매물이 slab 회사(bubble_id)에 연결돼 있어야 한다(미연결 시 null).
export async function getListingErpShares(listingId: string): Promise<
  | { ok: true; sharesOutstanding: number | null; sharePrice: number | null }
  | { ok: false; error: string }
> {
  if (!listingId) return { ok: false, error: "잘못된 요청입니다." };
  const supabase = await createClient();
  const { data: lst, error } = await supabase
    .from("listings")
    .select("bubble_id")
    .eq("id", listingId)
    .single();
  if (error) return { ok: false, error: error.message };
  const bubbleId = (lst?.bubble_id ?? null) as string | null;
  if (!bubbleId) return { ok: true, sharesOutstanding: null, sharePrice: null };
  try {
    const overview = await getErpCompanyOverview(bubbleId);
    return {
      ok: true,
      sharesOutstanding: overview.stock.sharesOutstanding,
      sharePrice: overview.stock.sharePrice,
    };
  } catch {
    return { ok: false, error: "slab 조회에 실패했습니다." };
  }
}

// ---- 매물 (Listing) --------------------------------------------------------

function listingPayload(fd: FormData) {
  // asking_valuation·summary 는 폼에서 제거됨 → payload 에 포함하지 않아
  // 수정 시 기존 값이 유지되고(덮어쓰지 않음), 생성 시에는 null 로 남는다.
  return {
    company_name: requiredText(fd, "company_name"),
    company_name_en: text(fd, "company_name_en"),
    status: text(fd, "status") ?? "LIVE",
    sector: text(fd, "sector"),
    stage: text(fd, "stage"),
    deck_url: text(fd, "deck_url"),
    latest_round_price: num(fd, "latest_round_price"),
  };
}

// 매물의 소속 운용펀드 태그를 선택값과 일치시킴(전체 삭제 후 재삽입 — 추가 속성 없는 단순 조인).
async function syncListingFunds(
  supabase: Awaited<ReturnType<typeof createClient>>,
  listingId: string,
  fundIds: string[],
): Promise<string | null> {
  const { error: delErr } = await supabase
    .from("listing_funds")
    .delete()
    .eq("listing_id", listingId);
  if (delErr) return delErr.message;

  if (fundIds.length === 0) return null;

  const { error: insErr } = await supabase.from("listing_funds").insert(
    fundIds.map((fid) => ({
      listing_id: listingId,
      holding_fund_id: fid,
    })),
  );
  return insErr?.message ?? null;
}

export async function createListing(
  _prev: ActionResult | undefined,
  fd: FormData,
): Promise<ActionResult> {
  const payload = listingPayload(fd);
  if (!payload.company_name) {
    return { ok: false, error: "회사명을 입력하세요." };
  }

  const supabase = await createClient();
  const { data: inserted, error } = await supabase
    .from("listings")
    .insert(payload)
    .select("id")
    .single();

  if (error || !inserted) {
    return { ok: false, error: error?.message ?? "매물 등록에 실패했습니다." };
  }

  const fundErr = await syncListingFunds(
    supabase,
    inserted.id as string,
    idList(fd, "holding_fund_ids"),
  );
  if (fundErr) return { ok: false, error: fundErr };

  // 투자 데이터(선택) — 폼에 라운드 섹션이 포함된 경우에만 동기화
  if (fd.get("rounds_present")) {
    const rErr = await syncExitRounds(
      supabase,
      inserted.id as string,
      parseRounds(fd),
    );
    if (rErr) return { ok: false, error: rErr };
  }

  revalidatePath("/listings");
  revalidatePath("/exit-scenario");
  return { ok: true };
}

export async function updateListing(
  _prev: ActionResult | undefined,
  fd: FormData,
): Promise<ActionResult> {
  const id = requiredText(fd, "id");
  const payload = listingPayload(fd);
  if (!id) return { ok: false, error: "잘못된 요청입니다." };
  if (!payload.company_name) {
    return { ok: false, error: "회사명을 입력하세요." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("listings")
    .update(payload)
    .eq("id", id);

  if (error) return { ok: false, error: error.message };

  const fundErr = await syncListingFunds(
    supabase,
    id,
    idList(fd, "holding_fund_ids"),
  );
  if (fundErr) return { ok: false, error: fundErr };

  // 투자 데이터(선택) — 폼에 라운드 섹션이 포함된 경우에만 동기화
  if (fd.get("rounds_present")) {
    const rErr = await syncExitRounds(supabase, id, parseRounds(fd));
    if (rErr) return { ok: false, error: rErr };
  }

  revalidatePath("/listings");
  revalidatePath(`/listings/${id}`);
  revalidatePath("/exit-scenario");
  return { ok: true };
}

/** 매물 목록에서 섹터·상태를 인라인(드롭다운)으로 즉시 수정. */
export async function updateListingInline(
  id: string,
  patch: { status?: string; sector?: string | null },
): Promise<ActionResult> {
  if (!id) return { ok: false, error: "잘못된 요청입니다." };

  const upd: { status?: string; sector?: string | null } = {};
  if (patch.status !== undefined) upd.status = patch.status;
  if (patch.sector !== undefined) upd.sector = patch.sector;
  if (Object.keys(upd).length === 0) return { ok: true };

  const supabase = await createClient();
  const { error } = await supabase.from("listings").update(upd).eq("id", id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/listings");
  revalidatePath(`/listings/${id}`);
  return { ok: true };
}

export async function deleteListing(id: string): Promise<void> {
  const supabase = await createClient();
  await supabase.from("listings").delete().eq("id", id);
  revalidatePath("/listings");
  redirect("/listings");
}

// ---- 운용펀드 (HoldingFund) ------------------------------------------------

function holdingFundPayload(fd: FormData) {
  return {
    name: requiredText(fd, "name"),
    short_name: text(fd, "short_name"),
    commitment: num(fd, "commitment"),
    vintage: intNum(fd, "vintage"),
    maturity_date: text(fd, "maturity_date"),
    status: text(fd, "status"),
    notes: text(fd, "notes"),
  };
}

export async function createHoldingFund(
  _prev: ActionResult | undefined,
  fd: FormData,
): Promise<ActionResult> {
  const payload = holdingFundPayload(fd);
  if (!payload.name) return { ok: false, error: "운용펀드명을 입력하세요." };

  const supabase = await createClient();
  const { error } = await supabase.from("holding_funds").insert(payload);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/funds");
  revalidatePath("/listings");
  return { ok: true };
}

export async function updateHoldingFund(
  _prev: ActionResult | undefined,
  fd: FormData,
): Promise<ActionResult> {
  const id = requiredText(fd, "id");
  const payload = holdingFundPayload(fd);
  if (!id) return { ok: false, error: "잘못된 요청입니다." };
  if (!payload.name) return { ok: false, error: "운용펀드명을 입력하세요." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("holding_funds")
    .update(payload)
    .eq("id", id);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/funds");
  revalidatePath("/listings");
  return { ok: true };
}

export async function deleteHoldingFund(id: string): Promise<void> {
  const supabase = await createClient();
  // listing_funds 는 FK on delete cascade 로 함께 정리됨.
  await supabase.from("holding_funds").delete().eq("id", id);
  revalidatePath("/funds");
  revalidatePath("/listings");
}
