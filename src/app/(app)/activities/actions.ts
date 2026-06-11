"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/supabase/auth";
import { ACTIVITY_TYPES, type ActivityType } from "@/lib/types";

export type ActionResult = { ok: true } | { ok: false; error: string };

function text(fd: FormData, key: string): string | null {
  const v = fd.get(key);
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t === "" ? null : t;
}

function requiredText(fd: FormData, key: string): string {
  return text(fd, key) ?? "";
}

function isType(v: string | null): v is ActivityType {
  return v !== null && (ACTIVITY_TYPES as string[]).includes(v);
}

function entryText(v: FormDataEntryValue | undefined): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t === "" ? null : t;
}

// 미팅 기록 시 새 투자사 등록(InvestorPicker new 모드). 투자사+컨택+조합 생성.
async function createInvestorFromForm(
  supabase: Awaited<ReturnType<typeof createClient>>,
  fd: FormData,
  ownerId: string,
  metDateOverride: string | null,
): Promise<{ id: string } | { error: string }> {
  const name = requiredText(fd, "investor_name");
  if (!name) return { error: "투자사명을 입력하세요." };

  const { data: inserted, error } = await supabase
    .from("investors")
    .insert({
      name,
      type: text(fd, "investor_type"),
      description: text(fd, "investor_description"),
      met_date: text(fd, "investor_met_date") ?? metDateOverride,
      owner_id: ownerId,
    })
    .select("id")
    .single();
  if (error || !inserted) {
    return { error: error?.message ?? "투자사 등록에 실패했습니다." };
  }
  const investorId = inserted.id as string;

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

export type MeetingResult =
  | { ok: true; investorId: string }
  | { ok: false; error: string };

// 매물 소개(딜) 없이 투자사 미팅을 기록 — 활동(deal_id 없음)으로 누적.
// 새 투자사면 투자사·조합도 함께 등록. 조합 정보 청취 미팅의 단일 진입점.
export async function logMeeting(
  _prev: MeetingResult | undefined,
  fd: FormData,
): Promise<MeetingResult> {
  const content = requiredText(fd, "content");
  if (!content) return { ok: false, error: "미팅 내용을 입력하세요." };

  const typeInput = text(fd, "type");
  const type: ActivityType = isType(typeInput) ? typeInput : "미팅";

  // 일자(YYYY-MM-DD) → 미팅 시각. 미입력 시 현재.
  const meetingDate = text(fd, "occurred_date");
  const occurredAt = meetingDate ?? new Date().toISOString();

  const supabase = await createClient();
  const me = await getCurrentUser();
  if (!me?.id) {
    return { ok: false, error: "작성자를 확인할 수 없습니다. 다시 로그인해 주세요." };
  }

  // 투자사: 기존 선택 또는 새 등록
  const mode = text(fd, "investor_mode");
  let investorId: string;
  let createdInvestor = false;
  if (mode === "new") {
    const result = await createInvestorFromForm(supabase, fd, me.id, meetingDate);
    if ("error" in result) return { ok: false, error: result.error };
    investorId = result.id;
    createdInvestor = true;
  } else {
    investorId = requiredText(fd, "investor_id");
    if (!investorId) return { ok: false, error: "투자사를 선택하세요." };
  }

  const { error } = await supabase.from("activities").insert({
    investor_id: investorId,
    deal_id: null,
    contact_id: null,
    type,
    occurred_at: occurredAt,
    content,
    author_id: me.id,
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/investors/${investorId}`);
  if (createdInvestor) revalidatePath("/investors");
  return { ok: true, investorId };
}

// 활동은 투자사 단위로 기록 → 투자사 상세를 무효화
export async function createActivity(
  _prev: ActionResult | undefined,
  fd: FormData,
): Promise<ActionResult> {
  const investorId = requiredText(fd, "investor_id");
  const typeInput = text(fd, "type");
  const content = requiredText(fd, "content");
  if (!investorId) return { ok: false, error: "잘못된 요청입니다." };
  if (!isType(typeInput)) return { ok: false, error: "활동 유형을 선택하세요." };
  if (!content) return { ok: false, error: "활동 내용을 입력하세요." };

  const supabase = await createClient();
  const me = await getCurrentUser();
  if (!me?.id) {
    return { ok: false, error: "작성자를 확인할 수 없습니다. 다시 로그인해 주세요." };
  }

  // datetime-local("YYYY-MM-DDTHH:mm") 또는 미입력 시 현재 시각
  const occurredAt = text(fd, "occurred_at") ?? new Date().toISOString();

  // 활동 삽입 시 contact_id 가 있으면 트리거가 last_contacted_at 자동 갱신(§4.3)
  const { error } = await supabase.from("activities").insert({
    investor_id: investorId,
    deal_id: text(fd, "deal_id"),
    contact_id: text(fd, "contact_id"),
    type: typeInput,
    occurred_at: occurredAt,
    content,
    author_id: me.id,
    attachment_url: text(fd, "attachment_url"),
  });

  if (error) return { ok: false, error: error.message };

  revalidatePath(`/investors/${investorId}`);
  return { ok: true };
}

export async function deleteActivity(
  id: string,
  investorId: string,
): Promise<void> {
  const supabase = await createClient();
  await supabase.from("activities").delete().eq("id", id);
  revalidatePath(`/investors/${investorId}`);
}
