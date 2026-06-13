"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import {
  getAllBubbleCompanies,
  getAllBubbleFunds,
  type BubbleCompany,
  type BubbleFund,
} from "@/lib/bubble";
import {
  matchFund,
  matchListing,
  runErpSync,
  type ApplyResult,
  type ExistingFund,
  type ExistingListing,
} from "@/lib/erp-sync";

// ---- 미리보기 -------------------------------------------------------------

export type SyncPreview = {
  ok: boolean;
  error?: string;
  funds: {
    create: { name: string; size: number | null }[];
    update: { currentName: string; erpName: string; size: number | null }[];
    keepManual: { name: string }[];
  };
  listings: {
    update: {
      currentName: string;
      erpNameKr: string;
      erpNameEn: string | null;
      sector: string | null;
      fundNames: string[];
      latestPrice: number | null;
    }[];
    unmatched: { id: string; name: string }[];
    erpUntrackedCount: number;
  };
  // 미매칭 매물을 수기로 ERP 회사에 연결할 때 쓰는 선택지(전체 ERP 회사).
  erpCompanies: { id: string; label: string }[];
};

export async function getSyncPreview(): Promise<SyncPreview> {
  const empty: SyncPreview = {
    ok: true,
    funds: { create: [], update: [], keepManual: [] },
    listings: { update: [], unmatched: [], erpUntrackedCount: 0 },
    erpCompanies: [],
  };

  let erpFunds: BubbleFund[];
  let erpCompanies: BubbleCompany[];
  try {
    [erpFunds, erpCompanies] = await Promise.all([
      getAllBubbleFunds(),
      getAllBubbleCompanies(),
    ]);
  } catch {
    return { ...empty, ok: false, error: "ERP 데이터를 불러오지 못했습니다." };
  }

  const supabase = await createClient();
  const [{ data: fundRows }, { data: listingRows }] = await Promise.all([
    supabase.from("holding_funds").select("id, name, short_name, bubble_id"),
    supabase
      .from("listings")
      .select(
        "id, company_name, company_name_en, sector, stage, latest_round_price, bubble_id, listing_funds(holding_fund_id)",
      ),
  ]);

  const existingFunds = (fundRows ?? []) as ExistingFund[];
  const existingListings = (listingRows ?? []) as ExistingListing[];

  // 펀드
  const matchedFundIds = new Set<string>();
  const fundCreate: SyncPreview["funds"]["create"] = [];
  const fundUpdate: SyncPreview["funds"]["update"] = [];
  for (const erp of erpFunds) {
    const m = matchFund(erp, existingFunds);
    if (m) {
      matchedFundIds.add(m.id);
      fundUpdate.push({ currentName: m.name, erpName: erp.name, size: erp.size });
    } else {
      fundCreate.push({ name: erp.name, size: erp.size });
    }
  }
  const fundKeepManual = existingFunds
    .filter((e) => !matchedFundIds.has(e.id))
    .map((e) => ({ name: e.name }));

  // 매물
  const matchedCompanyIds = new Set<string>();
  const listingUpdate: SyncPreview["listings"]["update"] = [];
  const listingUnmatched: SyncPreview["listings"]["unmatched"] = [];
  for (const lst of existingListings) {
    const c = matchListing(lst, erpCompanies);
    if (c) {
      matchedCompanyIds.add(c.id);
      listingUpdate.push({
        currentName: lst.company_name,
        erpNameKr: c.nameKr,
        erpNameEn: c.nameEn,
        sector: c.sector,
        fundNames: c.fundNames,
        // 최신 단가는 ERP 값(share price/분기현황)이 양수일 때만 갱신.
        latestPrice: c.sharePrice && c.sharePrice > 0 ? c.sharePrice : null,
      });
    } else {
      listingUnmatched.push({ id: lst.id, name: lst.company_name });
    }
  }
  const erpUntrackedCount = erpCompanies.filter(
    (c) => !matchedCompanyIds.has(c.id),
  ).length;

  // 수기 매칭용 ERP 회사 선택지(국문명 + 영문명 라벨, 이미 정렬됨).
  const erpCompanyOptions = erpCompanies.map((c) => ({
    id: c.id,
    label: c.nameEn ? `${c.nameKr} (${c.nameEn})` : c.nameKr,
  }));

  return {
    ok: true,
    funds: {
      create: fundCreate,
      update: fundUpdate,
      keepManual: fundKeepManual,
    },
    listings: {
      update: listingUpdate,
      unmatched: listingUnmatched,
      erpUntrackedCount,
    },
    erpCompanies: erpCompanyOptions,
  };
}

// 미매칭 매물을 수기로 ERP 회사에 연결 — listings.bubble_id 에 ERP _id 를 박는다.
// 이후 미리보기/동기화에서 이름과 무관하게 항상 그 회사로 매칭된다.
// erpCompanyId 가 null 이면 수기 매칭 해제.
export async function setListingErpMatch(
  listingId: string,
  erpCompanyId: string | null,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("listings")
    .update({ bubble_id: erpCompanyId })
    .eq("id", listingId);
  if (error) {
    // bubble_id 부분 유니크 위반 = 다른 매물이 이미 그 ERP 회사에 연결됨.
    if (error.code === "23505") {
      return {
        ok: false,
        error: "이 ERP 회사는 이미 다른 매물에 연결돼 있습니다.",
      };
    }
    return { ok: false, error: error.message };
  }
  revalidatePath("/funds/sync");
  return { ok: true };
}

// ---- 적용 -----------------------------------------------------------------

export type { ApplyResult } from "@/lib/erp-sync";

// 버튼에서 호출하는 서버 액션 — 로그인 세션(쿠키) 클라이언트로 동기화 실행.
// 핵심 로직은 erp-sync.ts(runErpSync)에 있고 크론과 공유한다.
export async function applyErpSync(): Promise<ApplyResult> {
  const supabase = await createClient();
  return runErpSync(supabase);
}
