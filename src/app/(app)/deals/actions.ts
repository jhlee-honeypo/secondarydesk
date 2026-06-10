"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/supabase/auth";
import { DEAL_STAGES, type DealStage } from "@/lib/types";

export type ActionResult =
  | { ok: true; created?: number; skipped?: number }
  | { ok: false; error: string };

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

// 조합 행(getAll) 매칭용: FormDataEntryValue → 정리된 문자열 또는 null
function entryText(v: FormDataEntryValue | undefined): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t === "" ? null : t;
}

// 딜 생성 시 "새 투자사 등록" 모드 → 투자사(+컨택+조합) 생성 후 id 반환.
// 투자사 폼(InvestorFormDialog)의 등록 로직을 딜 생성에 일원화한 것.
async function createInvestorInline(
  supabase: Awaited<ReturnType<typeof createClient>>,
  fd: FormData,
  fallbackOwnerId: string | null,
): Promise<{ id: string } | { error: string }> {
  const name = requiredText(fd, "investor_name");
  if (!name) return { error: "투자사명을 입력하세요." };

  const { data: inserted, error } = await supabase
    .from("investors")
    .insert({
      name,
      type: text(fd, "investor_type"),
      description: text(fd, "investor_description"),
      met_date: text(fd, "investor_met_date"),
      owner_id: fallbackOwnerId, // 담당 = 딜 생성자(계정) 자동
    })
    .select("id")
    .single();
  if (error || !inserted) {
    return { error: error?.message ?? "투자사 등록에 실패했습니다." };
  }
  const investorId = inserted.id as string;

  // 컨택 심사역(이름이 있을 때만)
  const contactName = text(fd, "contact_name");
  if (contactName) {
    await supabase.from("contacts").insert({
      investor_id: investorId,
      name: contactName,
      title: text(fd, "contact_title"),
    });
  }

  // 조합 행(조합명이 있는 행만)
  const fundNames = fd.getAll("fund_name");
  const fundPurposes = fd.getAll("fund_main_purpose");
  const fundNotes = fd.getAll("fund_notes");
  const fundsToInsert = fundNames
    .map((raw, i) => ({
      name: entryText(raw),
      main_purpose: entryText(fundPurposes[i]),
      notes: entryText(fundNotes[i]),
    }))
    .filter((f): f is { name: string; main_purpose: string | null; notes: string | null } =>
      Boolean(f.name),
    )
    .map((f) => ({ investor_id: investorId, ...f }));
  if (fundsToInsert.length > 0) {
    await supabase.from("funds").insert(fundsToInsert);
  }

  return { id: investorId };
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
// 한 투자사에 여러 매물을 한 번에 소개하는 경우를 위해 매물을 복수 선택할 수 있다
// (name="listing_ids"). 레거시 단일 필드(listing_id)도 폴백으로 허용.

export async function createDeal(
  _prev: ActionResult | undefined,
  fd: FormData,
): Promise<ActionResult> {
  const listingIds = [
    ...new Set(
      fd
        .getAll("listing_ids")
        .map((v) => (typeof v === "string" ? v.trim() : ""))
        .filter(Boolean),
    ),
  ];
  // 레거시/단일 경로 폴백
  if (listingIds.length === 0) {
    const single = requiredText(fd, "listing_id");
    if (single) listingIds.push(single);
  }

  if (listingIds.length === 0) return { ok: false, error: "매물을 선택하세요." };

  const me = await getCurrentUser();
  const ownerId = text(fd, "owner_id") ?? me?.id ?? null;
  if (!ownerId) {
    return { ok: false, error: "담당자를 확인할 수 없습니다. 다시 로그인해 주세요." };
  }

  const supabase = await createClient();

  // 투자사: 기존 선택 또는 새 투자사 등록(딜 생성에 일원화)
  const investorMode = text(fd, "investor_mode");
  let investorId: string;
  let createdInvestor = false;
  if (investorMode === "new") {
    const result = await createInvestorInline(supabase, fd, ownerId);
    if ("error" in result) return { ok: false, error: result.error };
    investorId = result.id;
    createdInvestor = true;
  } else {
    investorId = requiredText(fd, "investor_id");
    if (!investorId) return { ok: false, error: "투자사를 선택하세요." };
  }

  const stageInput = text(fd, "stage");
  const common = {
    investor_id: investorId,
    fund_id: text(fd, "fund_id"),
    owner_id: ownerId,
    stage: isStage(stageInput) ? stageInput : ("컨택" as DealStage),
    intro_source: text(fd, "intro_source"),
    intro_relationship: text(fd, "intro_relationship"),
    intro_date: text(fd, "intro_date"),
    expected_amount: num(fd, "expected_amount"),
    next_action: text(fd, "next_action"),
    next_action_date: text(fd, "next_action_date"),
  };

  // 이미 이 투자사에 딜이 있는 매물은 제외(unique(listing_id, investor_id) 충돌 방지)
  const { data: existing, error: exErr } = await supabase
    .from("deals")
    .select("listing_id")
    .eq("investor_id", investorId)
    .in("listing_id", listingIds);
  if (exErr) return { ok: false, error: exErr.message };

  const existingSet = new Set((existing ?? []).map((e) => e.listing_id as string));
  const toCreate = listingIds.filter((id) => !existingSet.has(id));
  const skipped = listingIds.length - toCreate.length;

  if (toCreate.length === 0) {
    return {
      ok: false,
      error:
        listingIds.length === 1
          ? "이미 이 매물과 투자사의 딜이 존재합니다. (중복 생성 불가)"
          : "선택한 매물이 모두 이미 이 투자사에 딜로 존재합니다.",
    };
  }

  const payloads = toCreate.map((listing_id) => ({ ...common, listing_id }));
  const { data: inserted, error } = await supabase
    .from("deals")
    .insert(payloads)
    .select("listing_id");

  if (error) {
    if (error.code === "23505") {
      return {
        ok: false,
        error: "일부 매물에 이미 딜이 있어 생성하지 못했습니다. 다시 시도해 주세요.",
      };
    }
    return { ok: false, error: error.message };
  }

  revalidatePath("/deals");
  for (const lid of toCreate) revalidatePath(`/listings/${lid}`);
  revalidatePath(`/investors/${investorId}`);
  if (createdInvestor) revalidatePath("/investors");

  return { ok: true, created: inserted?.length ?? toCreate.length, skipped };
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
