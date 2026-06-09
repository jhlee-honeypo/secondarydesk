"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/supabase/auth";
import { DEAL_STAGES, type DealStage } from "@/lib/types";

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

function isStage(v: string | null): v is DealStage {
  return v !== null && (DEAL_STAGES as string[]).includes(v);
}

// 딜 변경은 보드·매물·투자사 화면 모두에 영향 → 관련 경로 일괄 무효화
function revalidateDeal(listingId?: string | null, investorId?: string | null) {
  revalidatePath("/deals");
  if (listingId) revalidatePath(`/listings/${listingId}`);
  if (investorId) revalidatePath(`/investors/${investorId}`);
}

// 딜 insert 공통 처리(중복 제약 → 사용자 메시지). 성공 시 관련 경로 무효화.
async function insertDeal(payload: {
  listing_id: string;
  investor_id: string;
  fund_id: string | null;
  owner_id: string;
  stage: DealStage;
  intro_source?: string | null;
  intro_relationship?: string | null;
  intro_date?: string | null;
  expected_amount?: number | null;
  next_action?: string | null;
  next_action_date?: string | null;
}): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.from("deals").insert(payload);

  if (error) {
    // unique(listing_id, investor_id) 위반 → 동일 매물×투자사 중복 딜
    if (error.code === "23505") {
      return {
        ok: false,
        error: "이미 이 매물과 투자사의 딜이 존재합니다. (중복 생성 불가)",
      };
    }
    return { ok: false, error: error.message };
  }

  revalidateDeal(payload.listing_id, payload.investor_id);
  return { ok: true };
}

// ---- 딜 생성 (F6: 매물 × 투자사 태깅) --------------------------------------

export async function createDeal(
  _prev: ActionResult | undefined,
  fd: FormData,
): Promise<ActionResult> {
  const listingId = requiredText(fd, "listing_id");
  const investorId = requiredText(fd, "investor_id");
  if (!listingId) return { ok: false, error: "매물을 선택하세요." };
  if (!investorId) return { ok: false, error: "투자사를 선택하세요." };

  const me = await getCurrentUser();

  const stageInput = text(fd, "stage");
  const payload = {
    listing_id: listingId,
    investor_id: investorId,
    fund_id: text(fd, "fund_id"),
    owner_id: text(fd, "owner_id") ?? me?.id ?? null,
    stage: isStage(stageInput) ? stageInput : "컨택",
    intro_source: text(fd, "intro_source"),
    intro_relationship: text(fd, "intro_relationship"),
    intro_date: text(fd, "intro_date"),
    expected_amount: num(fd, "expected_amount"),
    next_action: text(fd, "next_action"),
    next_action_date: text(fd, "next_action_date"),
  };

  if (!payload.owner_id) {
    return { ok: false, error: "담당자를 확인할 수 없습니다. 다시 로그인해 주세요." };
  }

  return insertDeal({ ...payload, owner_id: payload.owner_id });
}

// ---- 적합도 추천에서 딜 1클릭 생성 (F7) ------------------------------------

export async function createDealFromMatch(
  listingId: string,
  investorId: string,
  fundId: string | null,
): Promise<ActionResult> {
  if (!listingId || !investorId) {
    return { ok: false, error: "잘못된 요청입니다." };
  }

  const me = await getCurrentUser();
  if (!me?.id) {
    return { ok: false, error: "담당자를 확인할 수 없습니다. 다시 로그인해 주세요." };
  }

  return insertDeal({
    listing_id: listingId,
    investor_id: investorId,
    fund_id: fundId,
    owner_id: me.id,
    stage: "컨택",
  });
}

// ---- 단계 이동 (드래그 시 즉시 저장) ---------------------------------------

export async function updateDealStage(
  id: string,
  stage: DealStage,
): Promise<ActionResult> {
  if (!isStage(stage)) return { ok: false, error: "잘못된 단계입니다." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("deals")
    .update({ stage })
    .eq("id", id)
    .select("listing_id, investor_id")
    .single();

  if (error) return { ok: false, error: error.message };

  revalidateDeal(data?.listing_id, data?.investor_id);
  return { ok: true };
}

// ---- 딜 수정 ---------------------------------------------------------------

export async function updateDeal(
  _prev: ActionResult | undefined,
  fd: FormData,
): Promise<ActionResult> {
  const id = requiredText(fd, "id");
  if (!id) return { ok: false, error: "잘못된 요청입니다." };

  const stageInput = text(fd, "stage");
  const payload = {
    fund_id: text(fd, "fund_id"),
    owner_id: text(fd, "owner_id"),
    stage: isStage(stageInput) ? stageInput : undefined,
    intro_source: text(fd, "intro_source"),
    intro_relationship: text(fd, "intro_relationship"),
    intro_date: text(fd, "intro_date"),
    expected_amount: num(fd, "expected_amount"),
    probability: intNum(fd, "probability"),
    next_action: text(fd, "next_action"),
    next_action_date: text(fd, "next_action_date"),
    target_close_date: text(fd, "target_close_date"),
    lost_reason: text(fd, "lost_reason"),
  };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("deals")
    .update(payload)
    .eq("id", id)
    .select("listing_id, investor_id")
    .single();

  if (error) return { ok: false, error: error.message };

  revalidateDeal(data?.listing_id, data?.investor_id);
  return { ok: true };
}

// ---- 딜 삭제 ---------------------------------------------------------------

export async function deleteDeal(
  id: string,
  opts?: { redirectTo?: string },
): Promise<void> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("deals")
    .delete()
    .eq("id", id)
    .select("listing_id, investor_id")
    .single();

  revalidateDeal(data?.listing_id, data?.investor_id);
  if (opts?.redirectTo) redirect(opts.redirectTo);
}
