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
