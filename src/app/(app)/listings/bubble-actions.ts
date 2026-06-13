"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import {
  getAllBubbleFunds,
  searchBubbleCompanies,
  searchBubbleFunds,
  type BubbleCompany,
  type BubbleFund,
} from "@/lib/bubble";

// 클라이언트 폼(운용펀드/매물)에서 호출하는 Bubble 온디맨드 조회 래퍼.
// Bubble 가 비활성/오류여도 폼이 죽지 않도록 try/catch 로 빈 배열을 반환한다.

export async function lookupBubbleFunds(q: string): Promise<BubbleFund[]> {
  try {
    return await searchBubbleFunds(q);
  } catch {
    return [];
  }
}

export async function lookupBubbleCompanies(
  q: string,
): Promise<BubbleCompany[]> {
  try {
    return await searchBubbleCompanies(q);
  } catch {
    return [];
  }
}

// ISO 일시 → KST 달력 날짜(YYYY-MM-DD). Bubble 날짜는 UTC 저장이라 +9h 보정.
function isoToKstDate(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return new Date(d.getTime() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

export type SyncResult =
  | { ok: true; created: number; updated: number }
  | { ok: false; error: string };

/** ERP 조합 전체를 운용펀드(holding_funds)로 일괄 동기화.
 *  bubble_id 로 멱등 매칭(없으면 이름) — 기존 펀드는 약정액·결성연도·만기만 갱신,
 *  약칭·상태·메모는 보존. 신규 펀드는 추가. */
export async function syncErpFunds(): Promise<SyncResult> {
  let funds: BubbleFund[];
  try {
    funds = await getAllBubbleFunds();
  } catch {
    return { ok: false, error: "ERP 조합을 불러오지 못했습니다." };
  }
  if (funds.length === 0) return { ok: true, created: 0, updated: 0 };

  const supabase = await createClient();
  const { data: existingRows, error: readErr } = await supabase
    .from("holding_funds")
    .select("id, name, bubble_id");
  if (readErr) return { ok: false, error: readErr.message };

  const norm = (s: string) => s.toLowerCase().replace(/\s+/g, "");
  const existing = (existingRows ?? []) as {
    id: string;
    name: string;
    bubble_id: string | null;
  }[];
  const byBubbleId = new Map(
    existing.filter((e) => e.bubble_id).map((e) => [e.bubble_id as string, e]),
  );
  const byName = new Map(existing.map((e) => [norm(e.name), e]));

  let created = 0;
  let updated = 0;

  for (const f of funds) {
    const fields = {
      name: f.name,
      commitment: f.size,
      vintage: f.startDate
        ? Number(isoToKstDate(f.startDate)?.slice(0, 4)) || null
        : null,
      maturity_date: isoToKstDate(f.endDate),
      bubble_id: f.id,
    };
    const match = byBubbleId.get(f.id) ?? byName.get(norm(f.name));
    if (match) {
      const { error } = await supabase
        .from("holding_funds")
        .update(fields)
        .eq("id", match.id);
      if (error) return { ok: false, error: error.message };
      updated++;
    } else {
      const { error } = await supabase.from("holding_funds").insert(fields);
      if (error) return { ok: false, error: error.message };
      created++;
    }
  }

  revalidatePath("/funds");
  revalidatePath("/listings");
  revalidatePath("/funds/erp");
  return { ok: true, created, updated };
}
