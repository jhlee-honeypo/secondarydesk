"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/supabase/auth";
import { DEAL_STAGES, type DealStage } from "@/lib/types";
import { normName as norm, splitNames } from "@/lib/normalize";

// 딜 생성의 "새 투자사 등록"(createInvestorInline)과 동일한 정보 구성:
// 투자사(메모·만난일자) + 컨택(심사역/직책/이메일/휴대폰) + 조합(명/주목적/비고).
export type DealImportRow = {
  listing_name?: string; // 매물명(여러 개는 ; 또는 줄바꿈으로 구분)
  bundle_name?: string; // 즐겨찾기 묶음명 — 그 묶음의 매물 전체로 펼침
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
  lost_reason?: string; // 드랍 사유(단계가 '드랍'인 행에서만 저장)
};

export type DealImportResult =
  | {
      ok: true;
      summary: {
        created: number; // 생성된 딜 수
        investorsCreated: number; // 새로 만든 투자사 수
        contactsCreated: number; // 새로 만든 컨택 수
        contactsFromCard: number; // 명함(리멤버)에서 연락처를 채운 컨택 수
        fundsCreated: number; // 새로 만든 조합 수
        skippedNoListing: number; // 매물 미등록으로 건너뛴 행
        skippedDup: number; // 이미 같은 매물×투자사 딜이 있어 건너뛴 행
        skippedNoData: number; // 투자사 또는 매물·묶음 모두 누락 행
        unmatchedListings: string[]; // 등록 안 된 매물명(중복 제거)
        unmatchedBundles: string[]; // 못 찾은 즐겨찾기 묶음명(중복 제거)
        contactsNoInfo: string[]; // 연락처 못 채운 컨택 — 직접 입력 필요(이름(투자사))
      };
    }
  | { ok: false; error: string };

function clean(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t === "" ? null : t;
}

// 다양한 표기를 YYYY-MM-DD 로. 구분자(. - /) 주변 공백도 허용한다
// (구글시트 복사본의 "2026. 3. 5" 형식 등). 매칭 실패 시 null.
function normDate(v: unknown): string | null {
  const s = clean(v);
  if (!s) return null;
  const m = s.match(/(\d{4})\s*[.\-/]\s*(\d{1,2})\s*[.\-/]\s*(\d{1,2})/);
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
//  - 매물: 한 행에 매물 여러 개(매물명 ;·줄바꿈 구분) + 즐겨찾기 묶음명을 함께 쓸 수
//    있고, 둘을 합집합해 매물마다 딜을 만든다(한 투자사 → 여러 매물을 한 행으로).
//    이름 매칭만 사용(임의 생성 안 함). 못 찾은 매물·묶음은 건너뛰고 보고.
//  - 투자사: 이름 매칭, 없으면 자동 생성 + (그 행의) 조합·메모·만난일자도 함께
//    생성(딜 생성의 새 투자사 등록과 동일).
//  - 컨택(심사역): 새·기존 투자사 모두, 같은 이름 컨택이 없으면 생성. 시트 값이
//    우선이고 빈 이메일·휴대폰·직책은 명함(리멤버) 백데이터에서 채운다(못 찾으면
//    이름만 등록 후 직접 입력 안내). 동명이인은 투자사명=소속으로 구분.
//  - 같은 매물×투자사 딜이 이미 있으면 건너뜀.
export async function importDeals(
  rows: DealImportRow[],
): Promise<DealImportResult> {
  const me = await getCurrentUser();
  if (!me) return { ok: false, error: "로그인이 필요합니다." };

  const supabase = await createClient();

  const [
    { data: invRows },
    { data: lstRows },
    { data: dealRows },
    { data: bundleRows },
    { data: contactRows },
    { data: cardRows },
  ] = await Promise.all([
    supabase.from("investors").select("id, name"),
    supabase.from("listings").select("id, company_name"),
    supabase.from("deals").select("investor_id, listing_id"),
    supabase.from("listing_bundles").select("name, listing_ids"),
    supabase.from("contacts").select("investor_id, name"),
    supabase
      .from("business_cards")
      .select("name, company, title, email, phone"),
  ]);

  const investorByNorm = new Map<string, string>();
  for (const i of (invRows ?? []) as { id: string; name: string }[]) {
    investorByNorm.set(norm(i.name), i.id);
  }
  const listingByNorm = new Map<string, string>();
  const validListingIds = new Set<string>();
  for (const l of (lstRows ?? []) as { id: string; company_name: string }[]) {
    listingByNorm.set(norm(l.company_name), l.id);
    validListingIds.add(l.id);
  }
  // 즐겨찾기 묶음: 정규화 이름 → 매물 id 목록(삭제된 매물 id는 적용 시 무시).
  const bundleByNorm = new Map<string, string[]>();
  for (const b of (bundleRows ?? []) as {
    name: string;
    listing_ids: string[];
  }[]) {
    bundleByNorm.set(norm(b.name), b.listing_ids ?? []);
  }
  const dealPairs = new Set(
    ((dealRows ?? []) as { investor_id: string; listing_id: string }[]).map(
      (d) => `${d.investor_id}:${d.listing_id}`,
    ),
  );

  // 컨택 중복 방지(투자사 + 이름). 같은 투자사에 같은 이름 컨택이 이미 있으면 안 만든다.
  const contactKeys = new Set(
    ((contactRows ?? []) as { investor_id: string; name: string }[]).map(
      (c) => `${c.investor_id}:${norm(c.name)}`,
    ),
  );

  // 명함(리멤버) 백데이터: 이름 → 명함 목록(동명이인 가능). 소속(company)으로 구분.
  type BizCard = {
    name: string;
    company: string | null;
    title: string | null;
    email: string | null;
    phone: string | null;
  };
  const cardsByName = new Map<string, BizCard[]>();
  for (const c of (cardRows ?? []) as BizCard[]) {
    const k = norm(c.name);
    const arr = cardsByName.get(k);
    if (arr) arr.push(c);
    else cardsByName.set(k, [c]);
  }
  // 이름으로 명함 찾기. 동명이인은 투자사명=소속 일치로 1건만 고르고, 가려지지 않으면
  // 자동채움을 보류(직접 입력으로 유도).
  const resolveCard = (
    contactName: string,
    investorName: string,
  ): BizCard | null => {
    const cands = cardsByName.get(norm(contactName));
    if (!cands || cands.length === 0) return null;
    if (cands.length === 1) return cands[0];
    const byCompany = cands.filter((c) => norm(c.company) === norm(investorName));
    return byCompany.length === 1 ? byCompany[0] : null;
  };

  let created = 0;
  let investorsCreated = 0;
  let contactsCreated = 0;
  let contactsFromCard = 0; // 명함에서 연락처를 채운 컨택 수
  let fundsCreated = 0;
  let skippedNoListing = 0;
  let skippedDup = 0;
  let skippedNoData = 0;
  const unmatchedListings = new Set<string>();
  const unmatchedBundles = new Set<string>();
  const contactsNoInfo = new Set<string>(); // 연락처 못 채운 컨택(직접 입력 필요)
  const touchedListings = new Set<string>();

  for (const row of rows) {
    const investorName = clean(row.investor_name);
    const bundleName = clean(row.bundle_name);
    const listingNames = splitNames(row.listing_name);
    // 투자사 + (매물 또는 묶음) 중 하나라도 없으면 데이터 부족
    if (!investorName || (!bundleName && listingNames.length === 0)) {
      skippedNoData++;
      continue;
    }

    // 대상 매물 id 모으기: 즐겨찾기 묶음 + 매물명(여러 개) → 합집합
    const targetListingIds = new Set<string>();
    if (bundleName) {
      const ids = bundleByNorm.get(norm(bundleName));
      if (!ids) {
        unmatchedBundles.add(bundleName);
      } else {
        for (const id of ids) if (validListingIds.has(id)) targetListingIds.add(id);
      }
    }
    for (const name of listingNames) {
      const id = listingByNorm.get(norm(name));
      if (!id) {
        skippedNoListing++;
        unmatchedListings.add(name);
      } else {
        targetListingIds.add(id);
      }
    }
    // 매칭된 매물이 하나도 없으면 이 행은 딜 없음(미매칭은 위에서 이미 보고).
    // 투자사 자동 생성도 하지 않아 고아 투자사를 만들지 않는다.
    if (targetListingIds.size === 0) continue;

    // 투자사: 매칭 또는 자동 생성(+조합·메모·만난일자 — 새 투자사일 때만). 행당 1회.
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

      // 조합(조합명 있을 때만) — 새 투자사 등록 시에만
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

    // 컨택 심사역 — 새/기존 투자사 모두. 같은 이름 컨택이 없을 때만 생성한다.
    // 시트의 직책·이메일·휴대폰이 우선이고, 빈 칸만 명함(리멤버)에서 채운다.
    // 명함에서도 연락처를 못 찾으면 이름만 등록하고 '직접 입력 필요'로 보고한다.
    const contactName = clean(row.contact_name);
    if (contactName) {
      const ckey = `${investorId}:${norm(contactName)}`;
      if (!contactKeys.has(ckey)) {
        contactKeys.add(ckey);
        let email = clean(row.contact_email);
        let phone = clean(row.contact_phone);
        let title = clean(row.contact_title);
        if (!email || !phone || !title) {
          const card = resolveCard(contactName, investorName);
          if (card) {
            let filled = false;
            if (!email && clean(card.email)) {
              email = clean(card.email);
              filled = true;
            }
            if (!phone && clean(card.phone)) {
              phone = clean(card.phone);
              filled = true;
            }
            if (!title) title = clean(card.title);
            if (filled) contactsFromCard++;
          }
        }
        const { error: cErr } = await supabase.from("contacts").insert({
          investor_id: investorId,
          name: contactName,
          title,
          email,
          phone,
        });
        if (cErr) return { ok: false, error: cErr.message };
        contactsCreated++;
        if (!email && !phone) contactsNoInfo.add(`${contactName}(${investorName})`);
      }
    }

    // 행의 단계·단계진입일자는 펼쳐진 모든 딜에 동일 적용.
    const stage = toStage(row.stage);
    const sd = normDate(row.stage_date);
    // 드랍 사유는 단계가 '드랍'일 때만 저장(앱 의미와 동일 — 그 외 단계는 무시).
    const lostReason = stage === "드랍" ? clean(row.lost_reason) : null;

    // 매물마다 딜 생성(같은 매물×투자사 중복 방지)
    for (const listingId of targetListingIds) {
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
          stage,
          lost_reason: lostReason,
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
      if (sd) {
        await supabase
          .from("deal_stage_events")
          .update({ changed_at: `${sd}T12:00:00+00:00` })
          .eq("deal_id", dealIns.id as string);
      }
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
      contactsFromCard,
      fundsCreated,
      skippedNoListing,
      skippedDup,
      skippedNoData,
      unmatchedListings: Array.from(unmatchedListings),
      unmatchedBundles: Array.from(unmatchedBundles),
      contactsNoInfo: Array.from(contactsNoInfo),
    },
  };
}
