"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import type { BusinessCard } from "@/lib/types";

// 명함 엑셀 1행 = 한 사람(명함). 투자사/컨택으로 바로 만들지 않고 검색용 백데이터
// (business_cards)로만 적재한다. 회사명은 동명이인 구분(소속)용.
// 리멤버 엑셀에서 실제 사용하는 컬럼: 회사·이름·직함·전자 메일 주소·휴대폰.
export type ContactImportRow = {
  name?: string; // 사람 이름(필수)
  company?: string; // 소속(회사명)
  title?: string; // 직함
  email?: string;
  mobile?: string; // 휴대폰
};

export type ContactImportResult =
  | {
      ok: true;
      summary: {
        cardsCreated: number; // 새로 적재된 명함 수
        duplicates: number; // 동일(이름+소속+연락처) 중복으로 건너뜀
        skipped: number; // 이름이 없어 제외된 행 수
      };
    }
  | { ok: false; error: string };

function clean(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t === "" ? null : t;
}

export async function importContacts(
  rows: ContactImportRow[],
): Promise<ContactImportResult> {
  if (!Array.isArray(rows) || rows.length === 0) {
    return { ok: false, error: "가져올 행이 없습니다." };
  }

  // 1) 사람 이름이 있는 행만 사용(명함의 검색 키)
  const valid = rows.filter((r) => clean(r.name));
  const skipped = rows.length - valid.length;
  if (valid.length === 0) {
    return { ok: false, error: "이름이 매핑된 행이 없습니다." };
  }

  const supabase = await createClient();

  // 2) 명함 행 구성(회사·이름·직함·이메일·휴대폰)
  const cards = valid.map((r) => ({
    name: clean(r.name)!,
    company: clean(r.company),
    title: clean(r.title), // 직함
    phone: clean(r.mobile), // 휴대폰
    email: clean(r.email),
  }));

  // 3) 재업로드 중복 방지 키(이름+소속+연락처). 기존 DB + 파일 내 중복 모두 차단.
  const dupKey = (c: { name: string; company: string | null; phone: string | null; email: string | null }) =>
    [
      c.name.trim().toLowerCase(),
      (c.company ?? "").trim().toLowerCase(),
      (c.phone ?? "").replace(/\D/g, ""),
      (c.email ?? "").trim().toLowerCase(),
    ].join("|");

  const { data: existing, error: exErr } = await supabase
    .from("business_cards")
    .select("name, company, phone, email");
  if (exErr) return { ok: false, error: exErr.message };

  const seen = new Set<string>();
  for (const e of existing ?? []) {
    seen.add(
      dupKey({
        name: (e.name as string) ?? "",
        company: (e.company as string) ?? null,
        phone: (e.phone as string) ?? null,
        email: (e.email as string) ?? null,
      }),
    );
  }

  const toInsert = [];
  let duplicates = 0;
  for (const c of cards) {
    const key = dupKey(c);
    if (seen.has(key)) {
      duplicates++;
      continue;
    }
    seen.add(key);
    toInsert.push(c);
  }

  let cardsCreated = 0;
  if (toInsert.length > 0) {
    const { data: inserted, error } = await supabase
      .from("business_cards")
      .insert(toInsert)
      .select("id");
    if (error) return { ok: false, error: `명함 적재 실패: ${error.message}` };
    cardsCreated = inserted?.length ?? toInsert.length;
  }

  revalidatePath("/import/contacts");
  return { ok: true, summary: { cardsCreated, duplicates, skipped } };
}

// ---- 명함 검색(딜 등록·미팅 기록의 투자사 입력 자동완성) -----------------------

export type BusinessCardHit = Pick<
  BusinessCard,
  "id" | "name" | "company" | "title" | "email" | "phone" | "met_date"
>;

export async function searchBusinessCards(
  query: string,
): Promise<BusinessCardHit[]> {
  const q = (query ?? "").trim();
  if (q.length < 1) return [];

  try {
    const supabase = await createClient();
    // 이름 또는 소속에 부분일치. 상위 8건.
    const pattern = `%${q.replace(/[%_]/g, "")}%`;
    const { data, error } = await supabase
      .from("business_cards")
      .select("id, name, company, title, email, phone, met_date")
      .or(`name.ilike.${pattern},company.ilike.${pattern}`)
      .order("name")
      .limit(8);
    if (error || !data) return [];
    return data as BusinessCardHit[];
  } catch {
    // 테이블 미생성(마이그레이션 미적용) 등 → 조용히 빈 결과
    return [];
  }
}
