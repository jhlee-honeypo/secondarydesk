"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/supabase/auth";

// 매물 메모 = append-only 스레드(listing_memos). 여러 유저가 동시에 달아도
// 각자 자기 행을 insert 하므로 서로의 글을 덮어쓰지 않는다.
export type ListingMemo = {
  id: string;
  body: string;
  author_id: string | null;
  author_name: string;
  created_at: string;
};

export type MemoResult = { ok: true } | { ok: false; error: string };

/** 매물의 메모 스레드(최신순). 다이얼로그를 열 때마다 새로 읽어 남이 쓴 글도 바로 보이게 한다. */
export async function listListingMemos(listingId: string): Promise<ListingMemo[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("listing_memos")
    .select("id, body, author_id, created_at, author:author_id (name, email)")
    .eq("listing_id", listingId)
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

export async function addListingMemo(
  listingId: string,
  body: string,
): Promise<MemoResult> {
  const me = await getCurrentUser();
  if (!me) return { ok: false, error: "로그인이 필요합니다." };

  const text = body.trim();
  if (!text) return { ok: false, error: "내용을 입력해 주세요." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("listing_memos")
    .insert({ listing_id: listingId, body: text, author_id: me.id });
  if (error) return { ok: false, error: error.message };

  revalidatePath("/financials");
  return { ok: true };
}

/** 삭제는 작성자 본인만(RLS 에서도 동일하게 막힌다). */
export async function deleteListingMemo(id: string): Promise<MemoResult> {
  const supabase = await createClient();
  const { error } = await supabase.from("listing_memos").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/financials");
  return { ok: true };
}
