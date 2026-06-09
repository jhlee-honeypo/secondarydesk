"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import {
  INVESTOR_TIERS,
  INVESTOR_TYPES,
  SECONDARY_APPETITES,
} from "@/lib/types";

export type ImportRow = {
  name?: string;
  type?: string;
  tier?: string;
  website?: string;
  description?: string;
  fund_name?: string;
  fund_dry_powder?: string;
  fund_maturity_date?: string;
  fund_main_purpose?: string;
  fund_secondary_appetite?: string;
};

export type ImportResult =
  | {
      ok: true;
      summary: {
        investorsCreated: number;
        investorsReused: number;
        fundsCreated: number;
        skipped: number;
      };
    }
  | { ok: false; error: string };

function clean(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t === "" ? null : t;
}

function inSet<T extends string>(v: string | null, set: readonly T[]): T | null {
  return v !== null && (set as readonly string[]).includes(v) ? (v as T) : null;
}

function num(v: string | null): number | null {
  if (v === null) return null;
  const n = Number(v.replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

function dateOrNull(v: string | null): string | null {
  return v !== null && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
}

export async function importInvestors(
  rows: ImportRow[],
): Promise<ImportResult> {
  if (!Array.isArray(rows) || rows.length === 0) {
    return { ok: false, error: "가져올 행이 없습니다." };
  }

  // 1) 투자사명이 있는 행만 사용
  const valid = rows.filter((r) => clean(r.name));
  const skipped = rows.length - valid.length;
  if (valid.length === 0) {
    return { ok: false, error: "투자사명이 매핑된 행이 없습니다." };
  }

  const supabase = await createClient();

  // 2) 기존 투자사 이름→id 맵(중복 생성 방지, 대소문자 무시)
  const { data: existingRows, error: exErr } = await supabase
    .from("investors")
    .select("id, name");
  if (exErr) return { ok: false, error: exErr.message };

  const idByName = new Map<string, string>();
  for (const e of existingRows ?? []) {
    idByName.set((e.name as string).trim().toLowerCase(), e.id as string);
  }

  // 3) 신규 투자사: CSV 내 이름 첫 등장 행의 속성 사용
  const newByKey = new Map<string, ImportRow>();
  for (const r of valid) {
    const key = clean(r.name)!.toLowerCase();
    if (!idByName.has(key) && !newByKey.has(key)) newByKey.set(key, r);
  }

  let investorsCreated = 0;
  if (newByKey.size > 0) {
    const payload = [...newByKey.values()].map((r) => ({
      name: clean(r.name)!,
      type: inSet(clean(r.type), INVESTOR_TYPES),
      tier: inSet(clean(r.tier), INVESTOR_TIERS),
      website: clean(r.website),
      description: clean(r.description),
    }));
    const { data: inserted, error } = await supabase
      .from("investors")
      .insert(payload)
      .select("id, name");
    if (error) return { ok: false, error: `투자사 생성 실패: ${error.message}` };
    investorsCreated = inserted?.length ?? 0;
    for (const e of inserted ?? []) {
      idByName.set((e.name as string).trim().toLowerCase(), e.id as string);
    }
  }

  // 4) 조합: fund_name 있는 행만, 투자사 id 매핑
  const fundPayload = valid
    .filter((r) => clean(r.fund_name))
    .map((r) => {
      const investorId = idByName.get(clean(r.name)!.toLowerCase());
      if (!investorId) return null;
      return {
        investor_id: investorId,
        name: clean(r.fund_name)!,
        dry_powder: num(clean(r.fund_dry_powder)),
        maturity_date: dateOrNull(clean(r.fund_maturity_date)),
        main_purpose: clean(r.fund_main_purpose),
        secondary_appetite: inSet(
          clean(r.fund_secondary_appetite),
          SECONDARY_APPETITES,
        ),
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  let fundsCreated = 0;
  if (fundPayload.length > 0) {
    const { data: insertedFunds, error } = await supabase
      .from("funds")
      .insert(fundPayload)
      .select("id");
    if (error) return { ok: false, error: `조합 생성 실패: ${error.message}` };
    fundsCreated = insertedFunds?.length ?? 0;
  }

  // 고유 투자사 이름 수 - 신규 생성 = 재사용(기존 매칭) 수
  const uniqueNames = new Set(valid.map((r) => clean(r.name)!.toLowerCase()));
  const reused = uniqueNames.size - investorsCreated;

  revalidatePath("/investors");
  return {
    ok: true,
    summary: {
      investorsCreated,
      investorsReused: Math.max(0, reused),
      fundsCreated,
      skipped,
    },
  };
}
