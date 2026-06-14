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
      email: text(fd, "contact_email"),
      phone: text(fd, "contact_phone"),
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
    lost_reason: text(fd, "lost_reason"), // 드랍 단계일 때만 폼에 존재(아니면 null)
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
    .select("id");

  if (error) {
    if (error.code === "23505") {
      return {
        ok: false,
        error: "일부 매물에 이미 딜이 있어 생성하지 못했습니다. 다시 시도해 주세요.",
      };
    }
    return { ok: false, error: error.message };
  }

  // 단계 진입 일자(과거 딜 입력 시) — 트리거가 생성 직후 만든 최초 단계 이력의
  // changed_at(기본 now())을 지정 일자로 덮어쓴다. 생성 직후엔 딜마다 이력이
  // 1건뿐이라 deal_id 매칭만으로 안전하다. TZ 무관하게 안전한 정오(UTC)로 저장.
  const stageDate = text(fd, "stage_date");
  if (
    stageDate &&
    /^\d{4}-\d{2}-\d{2}$/.test(stageDate) &&
    inserted &&
    inserted.length > 0
  ) {
    const ids = inserted.map((d) => d.id as string);
    await supabase
      .from("deal_stage_events")
      .update({ changed_at: `${stageDate}T12:00:00+00:00` })
      .in("deal_id", ids);
  }

  revalidatePath("/deals");
  for (const lid of toCreate) revalidatePath(`/listings/${lid}`);
  revalidatePath(`/investors/${investorId}`);
  if (createdInvestor) revalidatePath("/investors");

  return { ok: true, created: inserted?.length ?? toCreate.length, skipped };
}

// ---- 매물 즐겨찾기 묶음 (딜 생성 복수선택용, 팀 공유) ----------------------

export type ListingBundle = { id: string; name: string; listing_ids: string[] };

export async function listListingBundles(): Promise<ListingBundle[]> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("listing_bundles")
      .select("id, name, listing_ids")
      .order("name");
    if (error || !data) return [];
    return data as ListingBundle[];
  } catch {
    // 테이블 미생성(마이그레이션 미적용) 등 → 조용히 빈 목록
    return [];
  }
}

// 같은 이름이면 매물 목록을 갱신(덮어쓰기), 없으면 신규 생성.
export async function saveListingBundle(
  name: string,
  listingIds: string[],
): Promise<{ ok: true; bundle: ListingBundle } | { ok: false; error: string }> {
  const n = (name ?? "").trim();
  if (!n) return { ok: false, error: "묶음 이름을 입력하세요." };
  const ids = [...new Set((listingIds ?? []).filter(Boolean))];
  if (ids.length === 0) return { ok: false, error: "매물을 선택하세요." };

  const supabase = await createClient();
  const { data: existing } = await supabase
    .from("listing_bundles")
    .select("id")
    .eq("name", n)
    .limit(1)
    .maybeSingle();

  if (existing?.id) {
    const { data, error } = await supabase
      .from("listing_bundles")
      .update({ listing_ids: ids })
      .eq("id", existing.id as string)
      .select("id, name, listing_ids")
      .single();
    if (error || !data) return { ok: false, error: error?.message ?? "저장 실패" };
    revalidatePath("/deals");
    return { ok: true, bundle: data as ListingBundle };
  }

  const me = await getCurrentUser();
  const { data, error } = await supabase
    .from("listing_bundles")
    .insert({ name: n, listing_ids: ids, created_by: me?.id ?? null })
    .select("id, name, listing_ids")
    .single();
  if (error || !data) return { ok: false, error: error?.message ?? "저장 실패" };
  revalidatePath("/deals");
  return { ok: true, bundle: data as ListingBundle };
}

export async function deleteListingBundle(
  id: string,
): Promise<{ ok: boolean }> {
  if (!id) return { ok: false };
  const supabase = await createClient();
  const { error } = await supabase.from("listing_bundles").delete().eq("id", id);
  if (error) return { ok: false };
  revalidatePath("/deals");
  return { ok: true };
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

// ---- 딜 수정 폼: 투자사 편집 데이터 로드 -----------------------------------
// 칸반 카드에는 투자사가 {id, name} 만 실려오므로, 수정 다이얼로그를 열 때
// 유형·일자·메모·대표 컨택·조합을 별도 조회한다.

export type InvestorEditData = {
  investor: {
    name: string;
    type: string | null;
    met_date: string | null;
    description: string | null;
  };
  contact: {
    id: string;
    name: string;
    title: string | null;
    email: string | null;
    phone: string | null;
  } | null;
  funds: {
    id: string;
    name: string;
    main_purpose: string | null;
    notes: string | null;
  }[];
};

export async function getInvestorEditData(
  investorId: string,
): Promise<{ ok: true; data: InvestorEditData } | { ok: false; error: string }> {
  if (!investorId) return { ok: false, error: "잘못된 요청입니다." };

  const supabase = await createClient();
  const [{ data: inv, error: invErr }, { data: contacts }, { data: funds }] =
    await Promise.all([
      supabase
        .from("investors")
        .select("name, type, met_date, description")
        .eq("id", investorId)
        .single(),
      supabase
        .from("contacts")
        .select("id, name, title, email, phone")
        .eq("investor_id", investorId)
        .order("created_at", { ascending: true })
        .limit(1),
      supabase
        .from("funds")
        .select("id, name, main_purpose, notes")
        .eq("investor_id", investorId)
        .order("created_at", { ascending: true }),
    ]);

  if (invErr || !inv) {
    return { ok: false, error: invErr?.message ?? "투자사를 찾을 수 없습니다." };
  }

  return {
    ok: true,
    data: {
      investor: inv as InvestorEditData["investor"],
      contact: (contacts?.[0] as InvestorEditData["contact"]) ?? null,
      funds: (funds ?? []) as InvestorEditData["funds"],
    },
  };
}

// 수정 폼에서 함께 제출된 조합 행(name="fund_row_id"·"fund_name"·…)을
// 기존 조합과 동기화한다: 기존 행은 수정, 신규 행은 추가, 사라진 행은 삭제
// (단, 딜이 참조 중인 조합은 보존).
async function syncInvestorFunds(
  supabase: Awaited<ReturnType<typeof createClient>>,
  investorId: string,
  fd: FormData,
): Promise<void> {
  const ids = fd.getAll("fund_row_id");
  const names = fd.getAll("fund_name");
  const purposes = fd.getAll("fund_main_purpose");
  const notes = fd.getAll("fund_notes");

  const submittedIds = new Set<string>();
  for (let i = 0; i < names.length; i++) {
    const fid = entryText(ids[i]);
    const name = entryText(names[i]);
    const mainPurpose = entryText(purposes[i]);
    const note = entryText(notes[i]);

    if (fid) {
      submittedIds.add(fid);
      // 기존 조합 수정 (이름은 비어있지 않을 때만 갱신)
      const upd: { main_purpose: string | null; notes: string | null; name?: string } =
        { main_purpose: mainPurpose, notes: note };
      if (name) upd.name = name;
      await supabase.from("funds").update(upd).eq("id", fid);
    } else if (name) {
      // 신규 조합
      await supabase.from("funds").insert({
        investor_id: investorId,
        name,
        main_purpose: mainPurpose,
        notes: note,
      });
    }
  }

  // 제출되지 않은(=화면에서 제거된) 기존 조합 삭제. 단, 딜이 참조 중이면 보존.
  const { data: existing } = await supabase
    .from("funds")
    .select("id")
    .eq("investor_id", investorId);
  const toRemove = (existing ?? [])
    .map((f) => f.id as string)
    .filter((fid) => !submittedIds.has(fid));
  if (toRemove.length > 0) {
    const { data: refs } = await supabase
      .from("deals")
      .select("fund_id")
      .in("fund_id", toRemove);
    const referenced = new Set((refs ?? []).map((r) => r.fund_id as string));
    const deletable = toRemove.filter((fid) => !referenced.has(fid));
    if (deletable.length > 0) {
      await supabase.from("funds").delete().in("id", deletable);
    }
  }
}

// ---- 딜 수정 ---------------------------------------------------------------
// 딜 단계·대상 조합·담당·드랍 사유와 함께, 연결된 투자사 정보(투자사명·유형·
// 일자·메모·대표 컨택·조합)도 한 폼에서 편집한다.

export async function updateDeal(
  _prev: ActionResult | undefined,
  fd: FormData,
): Promise<ActionResult> {
  const id = requiredText(fd, "id");
  if (!id) return { ok: false, error: "잘못된 요청입니다." };

  const supabase = await createClient();

  // 1) 딜 본체(단계). 대상 조합/담당은 수정 폼에서 제거되어 건드리지 않는다.
  // 드랍 사유 칸은 단계가 '드랍'일 때만 폼에 있다. 필드가 제출됐을 때만 저장하고,
  // 없으면(드랍 외 단계) 기존 lost_reason 을 보존한다 — 단계를 바꿔도 사유 유지.
  const stageInput = text(fd, "stage");
  const dealPayload: { stage?: DealStage; lost_reason?: string | null } = {
    stage: isStage(stageInput) ? stageInput : undefined,
  };
  if (fd.has("lost_reason")) {
    dealPayload.lost_reason = text(fd, "lost_reason");
  }
  const { data: dealRow, error: dealErr } = await supabase
    .from("deals")
    .update(dealPayload)
    .eq("id", id)
    .select("listing_id, investor_id")
    .single();
  if (dealErr) return { ok: false, error: dealErr.message };

  const investorId = (dealRow?.investor_id as string | undefined) ?? null;

  // 2) 투자사 정보
  if (investorId) {
    const investorName = text(fd, "investor_name");
    if (investorName) {
      const { error: invErr } = await supabase
        .from("investors")
        .update({
          name: investorName,
          type: text(fd, "investor_type"),
          met_date: text(fd, "investor_met_date"),
          description: text(fd, "investor_description"),
        })
        .eq("id", investorId);
      if (invErr) return { ok: false, error: invErr.message };
    }

    // 3) 대표 컨택 (기존이면 수정, 없으면 이름 있을 때 생성)
    const contactId = text(fd, "contact_id");
    const contactName = text(fd, "contact_name");
    if (contactId) {
      const contactUpd: {
        title: string | null;
        email: string | null;
        phone: string | null;
        name?: string;
      } = {
        title: text(fd, "contact_title"),
        email: text(fd, "contact_email"),
        phone: text(fd, "contact_phone"),
      };
      if (contactName) contactUpd.name = contactName;
      await supabase.from("contacts").update(contactUpd).eq("id", contactId);
    } else if (contactName) {
      await supabase.from("contacts").insert({
        investor_id: investorId,
        name: contactName,
        title: text(fd, "contact_title"),
        email: text(fd, "contact_email"),
        phone: text(fd, "contact_phone"),
      });
    }

    // 4) 조합 동기화
    await syncInvestorFunds(supabase, investorId, fd);
  }

  revalidateDeal(dealRow?.listing_id, investorId);
  revalidatePath("/investors");
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

// ---- 단계 이력 관리 (딜 수정 폼) -------------------------------------------
// 잘못된 이동으로 쌓인 이력을 수정 폼에서 행별로 즉시 수정/삭제한다.
// (폼 저장과 분리 — 저장 시 stage 변경이 트리거로 새 이력을 만드는 것과 충돌 방지)

export type StageEventRow = {
  id: string;
  stage: DealStage;
  changed_at: string;
};

export async function getDealStageEvents(
  dealId: string,
): Promise<{ ok: true; events: StageEventRow[] } | { ok: false; error: string }> {
  if (!dealId) return { ok: false, error: "잘못된 요청입니다." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("deal_stage_events")
    .select("id, stage, changed_at")
    .eq("deal_id", dealId)
    .order("changed_at", { ascending: true });

  if (error) return { ok: false, error: error.message };
  return { ok: true, events: (data ?? []) as StageEventRow[] };
}

// 이력 수정(단계/일자) + 남은 이력의 최신 단계로 딜 단계 자동 동기화. 단계나 일자를
// 바꾸면 "가장 최근 이력"이 달라질 수 있어, 삭제와 동일하게 RPC 한 트랜잭션에서
// 트리거 이력 생성 없이 처리한다(마이그레이션 20260614000000).
export async function updateStageEvent(
  eventId: string,
  patch: { stage?: DealStage; changed_at?: string },
): Promise<ActionResult> {
  if (!eventId) return { ok: false, error: "잘못된 요청입니다." };

  const args: { p_event_id: string; p_stage?: DealStage; p_changed_at?: string } =
    { p_event_id: eventId };
  if (patch.stage && isStage(patch.stage)) args.p_stage = patch.stage;
  if (patch.changed_at) args.p_changed_at = patch.changed_at;
  if (args.p_stage === undefined && args.p_changed_at === undefined) {
    return { ok: true };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("update_stage_event_resync", args);

  if (error) return { ok: false, error: error.message };
  revalidatePath("/deals");
  return { ok: true };
}

// 이력 삭제 + 남은 이력의 최신 단계로 딜 단계 자동 동기화(예: IR 이력을 지우면
// 카드가 기업소개로 내려옴). 트리거가 새 이력을 만들지 않도록 DB 함수(RPC) 안에서
// 한 트랜잭션으로 처리한다(마이그레이션 20260614000000).
export async function deleteStageEvent(eventId: string): Promise<ActionResult> {
  if (!eventId) return { ok: false, error: "잘못된 요청입니다." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("delete_stage_event_resync", {
    p_event_id: eventId,
  });

  if (error) return { ok: false, error: error.message };
  revalidatePath("/deals");
  return { ok: true };
}
