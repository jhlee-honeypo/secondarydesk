"use server";

import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/supabase/auth";

export type ReviewFlagResult = { ok: true } | { ok: false; error: string };

// 메모는 "무엇이 잘못됐는지" 한 줄이면 충분하다. 길어질 얘기는 메모 열(스레드)로.
const NOTE_MAX = 300;

/** 추출값 확인 필요 표시/해제 — financial_review_flags 에 행이 있으면 확인 대상
 *  (statement_id = 저장된 재무 행 id = PK). on 상태로 다시 부르면 메모만 갱신된다.
 *
 *  ⚠️ revalidatePath 를 부르지 않는다. 이 페이지는 force-dynamic + slab API 조회라
 *  표시 하나 누를 때마다 표 전체를 다시 만들어야 해서 몇 초씩 멎는다. 화면은
 *  클라이언트 상태로 즉시 반영하고(ReviewFlag), 다음 로드 때 DB 값으로 맞춘다.
 *  (메모·미팅 핀·회수 전략 그룹과 같은 이유) */
export async function setReviewFlag(
  statementId: string,
  on: boolean,
  note: string,
): Promise<ReviewFlagResult> {
  const me = await getCurrentUser();
  if (!me) return { ok: false, error: "로그인이 필요합니다." };

  const supabase = await createClient();
  const { error } = on
    ? await supabase.from("financial_review_flags").upsert(
        {
          statement_id: statementId,
          note: note.trim().slice(0, NOTE_MAX) || null,
          updated_at: new Date().toISOString(),
          updated_by: me.id,
        },
        { onConflict: "statement_id" },
      )
    : await supabase
        .from("financial_review_flags")
        .delete()
        .eq("statement_id", statementId);

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
