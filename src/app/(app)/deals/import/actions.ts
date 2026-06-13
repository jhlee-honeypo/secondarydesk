"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/supabase/auth";
import { DEAL_STAGES, type DealStage } from "@/lib/types";

// 딜 생성의 "새 투자사 등록"(createInvestorInline)과 동일한 정보 구성:
// 투자사(메모·만난일자) + 컨택(심사역/직책/이메일/휴대폰) + 조합(명/주목적/비고).
export type DealImportRow = {
  listing_name?: string;
  investor_name?: string;
  met_date?: string; // 일자 = 투자사 만난 일자
  contact_name?: string; // 컨택 심사역
  contact_title?: string; // 직책
  contact_email?: string; // 이메일
  contact_phone?: string; // 휴대폰
  investor_description?: string; // 개요·성향 메모
  fund_name?: string; // 조합명
  fund_main_purpose?: string; // 주목적
  fund_notes?: string; // 비고
  stage?: string; // 단계
  stage_date?: string; // 단계 진입일자
};

export type DealImportResult =
  | {
      ok: true;
      summary: {
        created: number; // 생성된 딜 수
        investorsCreated: number; // 새로 만든 투자사 수
        contactsCreated: number; // 새로 만든 컨택 수
        fundsCreated: number; // 새로 만든 조합 수
        skippedNoListing: number; // 매물 미등록으로 건너뛴 행
        skippedDup: number; // 이미 같은 매물×투자사 딜이 있어 건너뛴 행
        skippedNoData: number; // 투자사·매물명 누락 행
        unmatchedListings: string[]; // 등록 안 된 매물명(중복 제거)
      };
    }
  | { ok: false; error: string };

function clean(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t === "" ? null : t;
}

// 회사/투자사명 정규화 — 공백·구두점·법인격 표기 제거 후 매칭.
function norm(s: string | null): string {
  return (s ?? "")
    .toLowerCase()
    .replace(/주식회사|유한회사|유한책임회사/g, "")
    .replace(/㈜/g, "")
    .replace(/\((주|유)\)/g, "")
    .replace(/[^a-z0-9가-힣]/g, "");
}

// 다양한 표기(YYYY-MM-DD / YYYY.MM.DD / YYYY/MM/DD)를 YYYY-MM-DD 로. 아니면 null.
function normDate(v: unknown): string | null {
  const s = clean(v);
  if (!s) return null;
  const m = s.match(/(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})/);
  if (!m) return null;
  const [, y, mo, d] = m;
  return `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
}

function toStage(v: unknown): DealStage {
  const s = clean(v);
  return s && (DEAL_STAGES as readonly string[]).includes(s)
    ? (s as DealStage)
    : "컨택";
}

// 엑셀 행 → 딜 일괄 생성.
//  - 매물: 이름 매칭, 없으면 건너뛰고 보고(임의 생성 안 함).
//  - 투자사: 이름 매칭, 없으면 자동 생성 + (그 행의) 컨택·조합·메모·만난일자도 함께
//    생성(딜 생성의 새 투자사 등록과 동일). 기존 투자사면 딜만 추가.
//  - 같은 매물×투자사 딜이 이미 있으면 건너뜀.
export async function importDeals(
  rows: DealImportRow[],
): Promise<DealImportResult> {
  const me = await getCurrentUser();
  if (!me) return { ok: false, error: "로그인이 필요합니다." };

  const supabase = await createClient();

  const [{ data: invRows }, { data: lstRows }, { data: dealRows }] =
    await Promise.all([
      supabase.from("investors").select("id, name"),
      supabase.from("listings").select("id, company_name"),
      supabase.from("deals").select("investor_id, listing_id"),
    ]);

  const investorByNorm = new Map<string, string>();
  for (const i of (invRows ?? []) as { id: string; name: string }[]) {
    investorByNorm.set(norm(i.name), i.id);
  }
  const listingByNorm = new Map<string, string>();
  for (const l of (lstRows ?? []) as { id: string; company_name: string }[]) {
    listingByNorm.set(norm(l.company_name), l.id);
  }
  const dealPairs = new Set(
    ((dealRows ?? []) as { investor_id: string; listing_id: string }[]).map(
      (d) => `${d.investor_id}:${d.listing_id}`,
    ),
  );

  let created = 0;
  let investorsCreated = 0;
  let contactsCreated = 0;
  let fundsCreated = 0;
  let skippedNoListing = 0;
  let skippedDup = 0;
  let skippedNoData = 0;
  const unmatchedListings = new Set<string>();
  const touchedListings = new Set<string>();

  for (const row of rows) {
    const investorName = clean(row.investor_name);
    const listingName = clean(row.listing_name);
    if (!investorName || !listingName) {
      skippedNoData++;
      continue;
    }

    // 매물: 등록된 것만(없으면 건너뛰고 보고)
    const listingId = listingByNorm.get(norm(listingName));
    if (!listingId) {
      skippedNoListing++;
      unmatchedListings.add(listingName);
      continue;
    }

    // 투자사: 매칭 또는 자동 생성(+컨택·조합·메모·만난일자 — 새 투자사일 때만)
    let investorId = investorByNorm.get(norm(investorName));
    if (!investorId) {
      const { data: ins, error } = await supabase
        .from("investors")
        .insert({
          name: investorName,
          description: clean(row.investor_description),
          met_date: normDate(row.met_date),
          owner_id: me.id,
        })
        .select("id")
        .single();
      if (error) return { ok: false, error: error.message };
      investorId = ins.id as string;
      investorByNorm.set(norm(investorName), investorId);
      investorsCreated++;

      // 컨택 심사역(이름 있을 때만)
      const contactName = clean(row.contact_name);
      if (contactName) {
        const { error: cErr } = await supabase.from("contacts").insert({
          investor_id: investorId,
          name: contactName,
          title: clean(row.contact_title),
          email: clean(row.contact_email),
          phone: clean(row.contact_phone),
        });
        if (cErr) return { ok: false, error: cErr.message };
        contactsCreated++;
      }

      // 조합(조합명 있을 때만)
      const fundName = clean(row.fund_name);
      if (fundName) {
        const { error: fErr } = await supabase.from("funds").insert({
          investor_id: investorId,
          name: fundName,
          main_purpose: clean(row.fund_main_purpose),
          notes: clean(row.fund_notes),
        });
        if (fErr) return { ok: false, error: fErr.message };
        fundsCreated++;
      }
    }

    // 중복(같은 매물×투자사) 방지
    const pairKey = `${investorId}:${listingId}`;
    if (dealPairs.has(pairKey)) {
      skippedDup++;
      continue;
    }
    dealPairs.add(pairKey);

    const { data: dealIns, error: dealErr } = await supabase
      .from("deals")
      .insert({
        listing_id: listingId,
        investor_id: investorId,
        owner_id: me.id,
        stage: toStage(row.stage),
      })
      .select("id")
      .single();
    if (dealErr) {
      if (dealErr.code === "23505") {
        skippedDup++;
        continue;
      }
      return { ok: false, error: dealErr.message };
    }
    created++;
    touchedListings.add(listingId);

    // 단계 진입 일자(과거 딜 백필) — 트리거가 만든 최초 단계 이력의 changed_at 을
    // 지정 일자로 덮는다(생성 직후라 딜당 이력 1건). TZ 안전한 정오(UTC)로 저장.
    const sd = normDate(row.stage_date);
    if (sd) {
      await supabase
        .from("deal_stage_events")
        .update({ changed_at: `${sd}T12:00:00+00:00` })
        .eq("deal_id", dealIns.id as string);
    }
  }

  revalidatePath("/deals");
  if (investorsCreated > 0) revalidatePath("/investors");
  for (const lid of touchedListings) revalidatePath(`/listings/${lid}`);

  return {
    ok: true,
    summary: {
      created,
      investorsCreated,
      contactsCreated,
      fundsCreated,
      skippedNoListing,
      skippedDup,
      skippedNoData,
      unmatchedListings: Array.from(unmatchedListings),
    },
  };
}
