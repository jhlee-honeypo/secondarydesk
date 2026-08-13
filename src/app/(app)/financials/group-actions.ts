"use server";

import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/supabase/auth";
import type { ListingGroupCode } from "@/lib/types";

export type GroupResult = { ok: true } | { ok: false; error: string };

/** 분기별 회수 전략 그룹(A/B/C) 기입·해제 — listing_quarter_groups.
 *  group = null 이면 행을 지운다(= 미기입 공란으로 되돌리기).
 *
 *  ⚠️ revalidatePath 를 부르지 않는다. 이 페이지는 force-dynamic + slab API 조회라
 *  버튼 하나 누를 때마다 표 전체를 다시 만들어야 해서 몇 초씩 멎는다. 화면은
 *  클라이언트 상태로 즉시 반영하고(QuarterGroupSelect), 다음 로드 때 DB 값으로 맞춘다.
 *  (메모·미팅 핀과 같은 이유) */
export async function setQuarterGroup(
  listingId: string,
  year: number,
  month: number,
  group: ListingGroupCode | null,
): Promise<GroupResult> {
  const me = await getCurrentUser();
  if (!me) return { ok: false, error: "로그인이 필요합니다." };

  const supabase = await createClient();
  const { error } = group
    ? await supabase.from("listing_quarter_groups").upsert(
        {
          listing_id: listingId,
          report_year: year,
          report_month: month,
          group_code: group,
          updated_at: new Date().toISOString(),
          updated_by: me.id,
        },
        { onConflict: "listing_id,report_year,report_month" },
      )
    : await supabase
        .from("listing_quarter_groups")
        .delete()
        .eq("listing_id", listingId)
        .eq("report_year", year)
        .eq("report_month", month);

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
