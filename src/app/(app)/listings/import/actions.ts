"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { LISTING_STATUSES } from "@/lib/types";

export type ListingImportRow = {
  company_name?: string;
  status?: string;
  sector?: string;
  stage?: string;
  asking_valuation?: string;
  summary?: string;
  deck_url?: string;
  fund_names?: string;
};

export type ListingImportResult =
  | {
      ok: true;
      summary: {
        created: number; // 신규로 생성된 매물 수
        updated: number; // 기존 매물에 조합이 새로 연결된 매물 수
        fundLinks: number; // 새로 추가된 매물↔운용펀드 연결 수(신규+기존)
        skipped: number; // 회사명이 없어 제외된 행 수
        unmatchedFunds: string[];
      };
    }
  | { ok: false; error: string };

function clean(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t === "" ? null : t;
}

function num(v: string | null): number | null {
  if (v === null) return null;
  const n = Number(v.replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

// 한 셀에 여러 펀드명을 ,·;·/·줄바꿈으로 구분해 적은 경우 분리
function splitFundNames(v: string | null): string[] {
  if (v === null) return [];
  return v
    .split(/[,;/\n]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

const STATUS_SET = new Set<string>(LISTING_STATUSES);

export async function importListings(
  rows: ListingImportRow[],
): Promise<ListingImportResult> {
  if (!Array.isArray(rows) || rows.length === 0) {
    return { ok: false, error: "가져올 행이 없습니다." };
  }

  // 1) 회사명이 있는 행만 사용
  const valid = rows.filter((r) => clean(r.company_name));
  const skipped = rows.length - valid.length;
  if (valid.length === 0) {
    return { ok: false, error: "회사명이 매핑된 행이 없습니다." };
  }

  const supabase = await createClient();

  // 2) 기존 매물 이름(소문자)→id — 신규 생성 여부 판단 + 기존 매물 조합 병합
  const { data: existing, error: exErr } = await supabase
    .from("listings")
    .select("id, company_name");
  if (exErr) return { ok: false, error: exErr.message };

  const idByName = new Map<string, string>();
  for (const e of existing ?? []) {
    idByName.set((e.company_name as string).trim().toLowerCase(), e.id as string);
  }
  // import 시작 시점에 이미 DB에 있던 매물(기존 매물 판별용)
  const preexistingKeys = new Set(idByName.keys());

  // 3) 운용펀드 이름→id 맵(태깅 매칭용, 대소문자 무시)
  const { data: funds, error: fundErr } = await supabase
    .from("holding_funds")
    .select("id, name");
  if (fundErr) return { ok: false, error: fundErr.message };

  const fundIdByName = new Map<string, string>();
  for (const f of funds ?? []) {
    fundIdByName.set((f.name as string).trim().toLowerCase(), f.id as string);
  }

  // 4) 회사명(소문자) 기준으로 행을 묶음 — 같은 매물이 여러 행/여러 조합으로
  //    나뉘어 있어도 조합명을 합쳐 한 매물로 처리(매물 1 : 조합 N).
  type Group = {
    name: string;
    payload: {
      company_name: string;
      status: string;
      sector: string | null;
      stage: string | null;
      asking_valuation: number | null;
      summary: string | null;
      deck_url: string | null;
    };
    fundNames: Set<string>;
  };

  const groups = new Map<string, Group>();
  for (const r of valid) {
    const name = clean(r.company_name)!;
    const key = name.toLowerCase();
    let g = groups.get(key);
    if (!g) {
      const rawStatus = clean(r.status);
      const status =
        rawStatus && STATUS_SET.has(rawStatus) ? rawStatus : "LIVE";
      g = {
        name,
        payload: {
          company_name: name,
          status,
          sector: clean(r.sector),
          stage: clean(r.stage),
          asking_valuation: num(clean(r.asking_valuation)),
          summary: clean(r.summary),
          deck_url: clean(r.deck_url),
        },
        fundNames: new Set<string>(),
      };
      groups.set(key, g);
    }
    for (const fn of splitFundNames(clean(r.fund_names ?? null))) {
      g.fundNames.add(fn);
    }
  }

  // 5) DB에 없는 매물만 신규 생성(기존 매물은 필드 변경 없이 조합만 병합)
  const newGroups = [...groups.entries()].filter(
    ([key]) => !preexistingKeys.has(key),
  );
  let created = 0;
  if (newGroups.length > 0) {
    const { data: inserted, error: insErr } = await supabase
      .from("listings")
      .insert(newGroups.map(([, g]) => g.payload))
      .select("id, company_name");
    if (insErr) return { ok: false, error: `매물 생성 실패: ${insErr.message}` };
    created = inserted?.length ?? newGroups.length;
    for (const e of inserted ?? []) {
      idByName.set((e.company_name as string).trim().toLowerCase(), e.id as string);
    }
  }

  // 6) 이미 존재하는 매물↔조합 연결을 조회해 중복 추가 방지
  const allListingIds = [...groups.keys()]
    .map((k) => idByName.get(k))
    .filter((v): v is string => Boolean(v));

  const existingPairs = new Set<string>();
  if (allListingIds.length > 0) {
    const { data: links, error: lfErr } = await supabase
      .from("listing_funds")
      .select("listing_id, holding_fund_id")
      .in("listing_id", allListingIds);
    if (lfErr) return { ok: false, error: lfErr.message };
    for (const l of links ?? []) {
      existingPairs.add(`${l.listing_id}:${l.holding_fund_id}`);
    }
  }

  // 7) 누락된 연결만 일괄 삽입. 기존 매물에 새 조합이 붙은 경우 별도 집계.
  const linkRows: { listing_id: string; holding_fund_id: string }[] = [];
  const unmatched = new Set<string>();
  const updatedExisting = new Set<string>();

  for (const [key, g] of groups) {
    const listingId = idByName.get(key);
    if (!listingId) continue;
    const isExisting = preexistingKeys.has(key);
    for (const fn of g.fundNames) {
      const fid = fundIdByName.get(fn.toLowerCase());
      if (!fid) {
        unmatched.add(fn);
        continue;
      }
      const pair = `${listingId}:${fid}`;
      if (existingPairs.has(pair)) continue; // 이미 연결됨
      existingPairs.add(pair); // 같은 import 내 중복도 방지
      linkRows.push({ listing_id: listingId, holding_fund_id: fid });
      if (isExisting) updatedExisting.add(listingId);
    }
  }

  let fundLinks = 0;
  if (linkRows.length > 0) {
    const { data: links, error: linkErr } = await supabase
      .from("listing_funds")
      .insert(linkRows)
      .select("listing_id");
    if (linkErr) return { ok: false, error: `운용펀드 태깅 실패: ${linkErr.message}` };
    fundLinks = links?.length ?? linkRows.length;
  }

  revalidatePath("/listings");
  return {
    ok: true,
    summary: {
      created,
      updated: updatedExisting.size,
      fundLinks,
      skipped,
      unmatchedFunds: [...unmatched],
    },
  };
}
