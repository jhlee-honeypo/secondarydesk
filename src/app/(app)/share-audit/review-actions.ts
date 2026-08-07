"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/supabase/auth";

import type { ReviewStatus } from "./types";

// 발행주식수 점검 조치 큐의 검토 상태 + 메모. 키는 slab company._id(회사 단위).

export type ShareAuditMemo = {
  id: string;
  body: string;
  author_id: string | null;
  author_name: string;
  created_at: string;
};

export type ReviewResult = { ok: true } | { ok: false; error: string };

/** 상태 지정·해제. 같은 값을 다시 누르면 호출자가 'open' 을 보내 되돌린다. */
export async function setShareAuditStatus(
  companyId: string,
  status: ReviewStatus,
): Promise<ReviewResult> {
  const me = await getCurrentUser();
  if (!me) return { ok: false, error: "로그인이 필요합니다." };

  const supabase = await createClient();

  // 'open' 은 기본값이라 행을 남기지 않는다(큐에 잔여 행이 쌓이지 않게).
  if (status === "open") {
    const { error } = await supabase
      .from("share_audit_reviews")
      .delete()
      .eq("company_id", companyId);
    if (error) return { ok: false, error: error.message };
  } else {
    const { error } = await supabase.from("share_audit_reviews").upsert(
      {
        company_id: companyId,
        status,
        updated_at: new Date().toISOString(),
        updated_by: me.id,
      },
      { onConflict: "company_id" },
    );
    if (error) return { ok: false, error: error.message };
  }

  revalidatePath("/share-audit");
  return { ok: true };
}

/** 회사의 메모 스레드(최신순). 행을 펼칠 때마다 새로 읽어 남이 쓴 글도 바로 보이게 한다. */
export async function listShareAuditMemos(
  companyId: string,
): Promise<ShareAuditMemo[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("share_audit_memos")
    .select("id, body, author_id, created_at, author:author_id (name, email)")
    .eq("company_id", companyId)
    .order("created_at", { ascending: false });

  return (data ?? []).map((m) => {
    // PostgREST 임베드는 관계에 따라 객체/배열 어느 쪽으로도 올 수 있다.
    const raw = m.author as
      | { name: string | null; email: string | null }
      | { name: string | null; email: string | null }[]
      | null;
    const author = Array.isArray(raw) ? (raw[0] ?? null) : raw;
    return {
      id: m.id as string,
      body: m.body as string,
      author_id: (m.author_id as string | null) ?? null,
      author_name: author?.name?.trim() || author?.email || "알 수 없음",
      created_at: m.created_at as string,
    };
  });
}

export async function addShareAuditMemo(
  companyId: string,
  body: string,
): Promise<ReviewResult> {
  const me = await getCurrentUser();
  if (!me) return { ok: false, error: "로그인이 필요합니다." };

  const text = body.trim();
  if (!text) return { ok: false, error: "내용을 입력해 주세요." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("share_audit_memos")
    .insert({ company_id: companyId, body: text, author_id: me.id });
  if (error) return { ok: false, error: error.message };

  revalidatePath("/share-audit");
  return { ok: true };
}

/** 삭제는 작성자 본인만(RLS 에서도 동일하게 막힌다). 수정은 지원하지 않는다. */
export async function deleteShareAuditMemo(id: string): Promise<ReviewResult> {
  const supabase = await createClient();
  const { error } = await supabase.from("share_audit_memos").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/share-audit");
  return { ok: true };
}
