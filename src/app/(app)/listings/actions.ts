"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

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

// ---- 매물 (Listing) --------------------------------------------------------

function listingPayload(fd: FormData) {
  return {
    company_name: requiredText(fd, "company_name"),
    status: text(fd, "status") ?? "세일즈중",
    sector: text(fd, "sector"),
    stage: text(fd, "stage"),
    asking_valuation: num(fd, "asking_valuation"),
    summary: text(fd, "summary"),
    deck_url: text(fd, "deck_url"),
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

  revalidatePath("/listings");
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

  revalidatePath("/listings/funds");
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

  revalidatePath("/listings/funds");
  revalidatePath("/listings");
  return { ok: true };
}

export async function deleteHoldingFund(id: string): Promise<void> {
  const supabase = await createClient();
  // listing_funds 는 FK on delete cascade 로 함께 정리됨.
  await supabase.from("holding_funds").delete().eq("id", id);
  revalidatePath("/listings/funds");
  revalidatePath("/listings");
}
