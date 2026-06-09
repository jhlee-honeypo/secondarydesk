// 알림/리마인더(F10, PRD §5.3) — 로그인 시 "오늘 해야 할 일"을 모아온다.
// 서버 전용(createClient 사용). 대시보드 홈과 /notifications 가 공유.

import { createClient } from "@/lib/supabase/server";
import type { Contact, DealCard, Fund, HoldingFund } from "@/lib/types";

const ACTION_WINDOW_DAYS = 7; // 다음 액션 예정일 임박 기준
const MATURITY_WINDOW_DAYS = 90; // 만기 임박 기준
const STALE_DAYS = 60; // 장기 미접촉 기준

function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addDays(base: Date, n: number): Date {
  const d = new Date(base);
  d.setDate(d.getDate() + n);
  return d;
}

export type FundMaturing = Fund & { investor: { id: string; name: string } | null };
export type StaleContact = Contact & {
  investor: { id: string; name: string } | null;
};

export type NotificationData = {
  todayStr: string;
  actionDeals: DealCard[];
  holdingFunds: HoldingFund[];
  funds: FundMaturing[];
  staleContacts: StaleContact[];
};

export async function loadNotifications(): Promise<NotificationData> {
  const supabase = await createClient();
  const today = new Date();
  const todayStr = iso(today);
  const actionMax = iso(addDays(today, ACTION_WINDOW_DAYS));
  const maturityMax = iso(addDays(today, MATURITY_WINDOW_DAYS));
  const staleBefore = iso(addDays(today, -STALE_DAYS));

  const [dealsRes, hfRes, fundsRes, contactsRes] = await Promise.all([
    supabase
      .from("deals")
      .select(
        "*, listing:listings(id, company_name), investor:investors(id, name), owner:users(id, name, email)",
      )
      .not("next_action_date", "is", null)
      .lte("next_action_date", actionMax)
      .order("next_action_date"),
    supabase
      .from("holding_funds")
      .select("*")
      .not("maturity_date", "is", null)
      .lte("maturity_date", maturityMax)
      .order("maturity_date"),
    supabase
      .from("funds")
      .select("*, investor:investors(id, name)")
      .not("maturity_date", "is", null)
      .lte("maturity_date", maturityMax)
      .order("maturity_date"),
    supabase
      .from("contacts")
      .select("*, investor:investors(id, name)")
      .not("last_contacted_at", "is", null)
      .lt("last_contacted_at", staleBefore)
      .order("last_contacted_at"),
  ]);

  // 종료 단계(클로징·드랍)는 액션 알림에서 제외
  const actionDeals = ((dealsRes.data ?? []) as DealCard[]).filter(
    (d) => d.stage !== "클로징" && d.stage !== "드랍",
  );

  return {
    todayStr,
    actionDeals,
    holdingFunds: (hfRes.data ?? []) as HoldingFund[],
    funds: (fundsRes.data ?? []) as FundMaturing[],
    staleContacts: (contactsRes.data ?? []) as StaleContact[],
  };
}
