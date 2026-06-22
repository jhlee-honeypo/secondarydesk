// 투자사 정규화 매칭 / 별칭 공용 로직(서버 전용).
// 투자사명을 하나의 정규 레코드로 모으기 위해 딜 생성·미팅 기록 등 여러 서버
// 액션이 공유한다. 매칭은 normName(소문자·법인격·공백·구두점 제거)으로 한다.
import { createClient } from "@/lib/supabase/server";
import { normName } from "@/lib/normalize";

type Sb = Awaited<ReturnType<typeof createClient>>;

export type InvestorMatch = { id: string; name: string; via?: string };

// 정규화가 "정확히" 일치하는 기존 투자사(정규명 또는 별칭). 자동연결 안전망용.
export async function findInvestorByNorm(
  supabase: Sb,
  rawName: string,
): Promise<{ id: string; name: string } | null> {
  const key = normName(rawName);
  if (!key) return null;

  const { data: investors } = await supabase.from("investors").select("id, name");
  for (const inv of investors ?? []) {
    if (normName(inv.name as string) === key) {
      return { id: inv.id as string, name: inv.name as string };
    }
  }
  const { data: aliases } = await supabase
    .from("investor_aliases")
    .select("investor_id, alias");
  const hit = (aliases ?? []).find((a) => normName(a.alias as string) === key);
  if (hit) {
    const nm =
      (investors ?? []).find((i) => i.id === hit.investor_id)?.name ?? "";
    return { id: hit.investor_id as string, name: nm as string };
  }
  return null;
}

// 입력 표기를 정규 레코드의 별칭으로 기록(정규명과 같거나 이미 있으면 건너뜀).
export async function recordAlias(
  supabase: Sb,
  investorId: string,
  canonicalName: string,
  rawName: string,
  source: string,
): Promise<void> {
  const raw = rawName.trim();
  if (!raw || normName(raw) === normName(canonicalName)) return;
  const { data: existing } = await supabase
    .from("investor_aliases")
    .select("alias")
    .eq("investor_id", investorId);
  if ((existing ?? []).some((a) => normName(a.alias as string) === normName(raw))) {
    return;
  }
  await supabase
    .from("investor_aliases")
    .insert({ investor_id: investorId, alias: raw, source });
}

// 기존 투자사에 폼 입력을 "추가 중심"으로 반영한다(딜 생성·미팅 기록의 기존 선택).
//  - 컨택 심사역: 같은 이름이 없을 때만 새 컨택으로 추가
//  - 조합: 같은 이름이 없는 조합만 추가
//  - 유형·일자·개요 메모: 기존 값이 비어 있을 때만 채움(덮어쓰기 안 함)
export async function enrichExistingInvestor(
  supabase: Sb,
  investorId: string,
  fd: FormData,
): Promise<void> {
  const get = (k: string): string | null => {
    const v = fd.get(k);
    return typeof v === "string" && v.trim() ? v.trim() : null;
  };

  // 1) 투자사 레벨 필드 — 비어 있을 때만 보강
  const { data: inv } = await supabase
    .from("investors")
    .select("type, met_date, description")
    .eq("id", investorId)
    .single();
  if (inv) {
    const patch: Record<string, string> = {};
    if (!inv.type && get("investor_type")) patch.type = get("investor_type")!;
    if (!inv.met_date && get("investor_met_date"))
      patch.met_date = get("investor_met_date")!;
    if (!inv.description && get("investor_description"))
      patch.description = get("investor_description")!;
    if (Object.keys(patch).length > 0) {
      await supabase.from("investors").update(patch).eq("id", investorId);
    }
  }

  // 2) 컨택 심사역 — 같은 이름이 없을 때만 추가
  const contactName = get("contact_name");
  if (contactName) {
    const { data: contacts } = await supabase
      .from("contacts")
      .select("name")
      .eq("investor_id", investorId);
    const dup = (contacts ?? []).some(
      (c) => normName(c.name as string) === normName(contactName),
    );
    if (!dup) {
      await supabase.from("contacts").insert({
        investor_id: investorId,
        name: contactName,
        title: get("contact_title"),
        email: get("contact_email"),
        phone: get("contact_phone"),
      });
    }
  }

  // 3) 조합 — 같은 이름이 없는 행만 추가
  const fundNames = fd.getAll("fund_name");
  const fundPurposes = fd.getAll("fund_main_purpose");
  const fundNotes = fd.getAll("fund_notes");
  const entered = fundNames
    .map((raw, i) => ({
      name: typeof raw === "string" ? raw.trim() : "",
      main_purpose:
        typeof fundPurposes[i] === "string"
          ? (fundPurposes[i] as string).trim() || null
          : null,
      notes:
        typeof fundNotes[i] === "string"
          ? (fundNotes[i] as string).trim() || null
          : null,
    }))
    .filter((f) => f.name);
  if (entered.length > 0) {
    const { data: existingFunds } = await supabase
      .from("funds")
      .select("name")
      .eq("investor_id", investorId);
    const existingNorm = new Set(
      (existingFunds ?? []).map((f) => normName(f.name as string)),
    );
    const toInsert = entered
      .filter((f) => !existingNorm.has(normName(f.name)))
      .map((f) => ({ investor_id: investorId, ...f }));
    if (toInsert.length > 0) {
      await supabase.from("funds").insert(toInsert);
    }
  }
}

// 정규명 또는 별칭이 검색어를 포함하는 투자사 후보(딜 폼의 실시간 제안용).
export async function searchInvestorMatches(
  supabase: Sb,
  query: string,
): Promise<InvestorMatch[]> {
  const key = normName(query);
  if (key.length < 2) return [];

  const { data: investors } = await supabase
    .from("investors")
    .select("id, name")
    .order("name");
  const { data: aliases } = await supabase
    .from("investor_aliases")
    .select("investor_id, alias");

  const out: InvestorMatch[] = [];
  const seen = new Set<string>();
  for (const inv of investors ?? []) {
    if (normName(inv.name as string).includes(key)) {
      out.push({ id: inv.id as string, name: inv.name as string });
      seen.add(inv.id as string);
    }
  }
  const nameById = new Map(
    (investors ?? []).map((i) => [i.id as string, i.name as string]),
  );
  for (const a of aliases ?? []) {
    const id = a.investor_id as string;
    if (seen.has(id)) continue;
    if (normName(a.alias as string).includes(key)) {
      const nm = nameById.get(id);
      if (nm) {
        out.push({ id, name: nm, via: a.alias as string });
        seen.add(id);
      }
    }
  }
  return out.slice(0, 8);
}
