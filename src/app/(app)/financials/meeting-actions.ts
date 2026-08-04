"use server";

import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/supabase/auth";

export type MeetingResult = { ok: true } | { ok: false; error: string };

/** 미팅 대상 지정/해제 — listing_meeting_targets 에 행이 있으면 대상(listing_id = PK).
 *
 *  ⚠️ revalidatePath 를 부르지 않는다. 이 페이지는 force-dynamic + slab API 조회라
 *  핀 하나 누를 때마다 표 전체를 다시 만들어야 해서 몇 초씩 멎는다. 화면은 클라이언트
 *  상태로 즉시 반영하고(MeetingPin), 다음 로드 때 DB 값으로 맞춘다. */
export async function setMeetingTarget(
  listingId: string,
  on: boolean,
): Promise<MeetingResult> {
  const me = await getCurrentUser();
  if (!me) return { ok: false, error: "로그인이 필요합니다." };

  const supabase = await createClient();
  const { error } = on
    ? await supabase
        .from("listing_meeting_targets")
        .upsert({ listing_id: listingId, created_by: me.id }, { onConflict: "listing_id" })
    : await supabase.from("listing_meeting_targets").delete().eq("listing_id", listingId);

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
