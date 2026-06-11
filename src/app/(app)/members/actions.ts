"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/supabase/auth";

export type MemberActionResult = { ok: true } | { ok: false; error: string };

async function requireLead(): Promise<{ id: string } | { error: string }> {
  const me = await getCurrentUser();
  if (!me) return { error: "로그인이 필요합니다." };
  if (me.profile?.role !== "lead") {
    return { error: "관리자(lead)만 수행할 수 있습니다." };
  }
  return { id: me.id };
}

/** 가입자 승인/승인취소. (RLS: lead 만 타 사용자 행 수정 가능) */
export async function setUserApproved(
  userId: string,
  approved: boolean,
): Promise<MemberActionResult> {
  const lead = await requireLead();
  if ("error" in lead) return { ok: false, error: lead.error };
  if (!userId) return { ok: false, error: "잘못된 요청입니다." };
  if (userId === lead.id) {
    return { ok: false, error: "본인 계정은 변경할 수 없습니다." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("users")
    .update({ approved })
    .eq("id", userId);

  if (error) return { ok: false, error: error.message };
  revalidatePath("/members");
  return { ok: true };
}

/** 가입 거부: 프로필 행 삭제(접근 영구 차단). (RLS: lead delete 정책) */
export async function rejectUser(userId: string): Promise<MemberActionResult> {
  const lead = await requireLead();
  if ("error" in lead) return { ok: false, error: lead.error };
  if (!userId) return { ok: false, error: "잘못된 요청입니다." };
  if (userId === lead.id) {
    return { ok: false, error: "본인 계정은 삭제할 수 없습니다." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("users").delete().eq("id", userId);

  if (error) return { ok: false, error: error.message };
  revalidatePath("/members");
  return { ok: true };
}
