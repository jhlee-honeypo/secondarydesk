"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";

// DIVA(벤처캐피탈협회 전자공시) 조합 임포트. 스크래퍼가 공동GP를 운용사별 행으로
// 분해해 주므로 1행 = (조합 × 운용사) 하나. 운용사(GP)는 OPER_INST_ID로 식별해
// 투자사를 find-or-create(기존 투자사는 이름 정확일치로 찾아 ID backfill), 조합은
// ASCT_ID로 그 투자사 아래 멱등 upsert 한다. 같은 조합이 공동GP면 각 운용사 아래에
// 한 건씩 붙는다(회사는 ID로 식별돼 중복 생성 안 됨).
export type FundImportRow = {
  oper_inst_id?: string; // 운용사ID — 투자사 식별 키
  oper_inst_nm?: string; // 회사명(운용사)
  asct_nm?: string; // 조합명(필수)
  reg_date?: string; // 등록일 → formation_date(일단위) + vintage(연도)
  aum?: string; // 결성총액(원)
  maturity_date?: string; // 만기일
  invst_fld?: string; // 투자분야 → sector_focus
  purpose?: string; // 목적구분 → main_purpose
  diva_asct_id?: string; // 조합ID — 멱등 키
};

export type FundImportResult =
  | {
      ok: true;
      summary: {
        investorsCreated: number; // 새로 등록된 운용사(투자사)
        investorsMatched: number; // 기존 투자사와 매칭(재사용)
        fundsCreated: number; // 새로 적재된 조합
        fundsUpdated: number; // 갱신된 조합
        skipped: number; // 조합명/운용사 없는 행
      };
    }
  | { ok: false; error: string };

function clean(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t === "" ? null : t;
}

// 대량 insert는 배치로 쪼갠다(단일 요청 과대 방지).
function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// 이름 매칭용 정규화: 소문자 + 법인격 표기·공백·구두점 제거.
function norm(s: string): string {
  return s
    .toLowerCase()
    .replace(/주식회사|유한책임회사|유한회사/g, "")
    .replace(/[\s()（）㈜·.,'"\-_/]/g, "");
}

function num(v: string | null): number | null {
  if (v === null) return null;
  const n = Number(v.replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) && n !== 0 ? n : null;
}

function yearOf(v: string | null): number | null {
  const m = (v ?? "").match(/(\d{4})/);
  return m ? Number(m[1]) : null;
}

function dateOrNull(v: string | null): string | null {
  const m = (v ?? "").match(/\d{4}-\d{2}-\d{2}/);
  return m ? m[0] : null;
}

function sectors(v: string | null): string[] | null {
  if (v === null) return null;
  const out = v.split(/[/,;]/).map((s) => s.trim()).filter(Boolean);
  return out.length ? out : null;
}

function purposeOrNull(v: string | null): string | null {
  if (v === null || v === "해당없음") return null;
  return v;
}

// DIVA가 주는 필드만 담은 조합 payload(투자사 수기 입력값은 갱신 시 보존).
type DivaPayload = {
  name: string;
  aum: number | null;
  vintage: number | null;
  formation_date: string | null;
  maturity_date: string | null;
  sector_focus: string[] | null;
  main_purpose: string | null;
  diva_asct_id: string | null;
};

export async function importFunds(
  rows: FundImportRow[],
): Promise<FundImportResult> {
  if (!Array.isArray(rows) || rows.length === 0) {
    return { ok: false, error: "가져올 행이 없습니다." };
  }

  // 1) 조합명 + 운용사(이름 또는 ID)가 있는 행만 사용
  const valid = rows.filter(
    (r) => clean(r.asct_nm) && (clean(r.oper_inst_id) || clean(r.oper_inst_nm)),
  );
  const skipped = rows.length - valid.length;
  if (valid.length === 0) {
    return { ok: false, error: "조합명·운용사가 매핑된 행이 없습니다." };
  }

  const supabase = await createClient();

  // 2) 기존 투자사 → 운용사ID / 정규화 이름으로 매칭
  const { data: investors, error: invErr } = await supabase
    .from("investors")
    .select("id, name, diva_oper_inst_id");
  if (invErr) return { ok: false, error: invErr.message };

  const byOperId = new Map<string, string>(); // diva_oper_inst_id → investorId
  const byName = new Map<string, string>(); // norm(name) → investorId
  const operIdSet = new Map<string, boolean>(); // investorId → diva_oper_inst_id 보유여부
  for (const i of investors ?? []) {
    const id = i.id as string;
    const operId = i.diva_oper_inst_id as string | null;
    if (operId) byOperId.set(operId, id);
    operIdSet.set(id, !!operId);
    const n = norm(i.name as string);
    if (n.length >= 2 && !byName.has(n)) byName.set(n, id);
  }

  // 3) 신규 운용사 수집 + 기존 투자사 ID backfill 계획
  const newByOper = new Map<
    string,
    { name: string; diva_oper_inst_id: string | null }
  >(); // 키: operId 또는 `nm:${normNm}`
  const backfill = new Map<string, string>(); // investorId → operId(채워넣을 값)
  let matchedExisting = 0;
  const matchedIds = new Set<string>();

  for (const r of valid) {
    const operId = clean(r.oper_inst_id);
    const operNm = clean(r.oper_inst_nm);
    const nKey = operNm ? norm(operNm) : "";
    const existing =
      (operId && byOperId.get(operId)) || (nKey && byName.get(nKey)) || null;
    if (existing) {
      if (!matchedIds.has(existing)) {
        matchedIds.add(existing);
        matchedExisting++;
      }
      // 이름으로 매칭됐는데 아직 운용사ID가 없으면 채워넣기
      if (operId && !operIdSet.get(existing) && !byOperId.has(operId)) {
        backfill.set(existing, operId);
      }
      continue;
    }
    const key = operId ?? `nm:${nKey}`;
    if (!newByOper.has(key)) {
      newByOper.set(key, {
        name: operNm ?? operId!,
        diva_oper_inst_id: operId,
      });
    }
  }

  // 4) 신규 투자사 일괄 생성(배치)
  let investorsCreated = 0;
  for (const batch of chunk([...newByOper.values()], 500)) {
    const { data: created, error } = await supabase
      .from("investors")
      .insert(batch)
      .select("id, name, diva_oper_inst_id");
    if (error)
      return { ok: false, error: `투자사 생성 실패: ${error.message}` };
    investorsCreated += created?.length ?? batch.length;
    for (const c of created ?? []) {
      const id = c.id as string;
      const operId = c.diva_oper_inst_id as string | null;
      if (operId) byOperId.set(operId, id);
      byName.set(norm(c.name as string), id);
    }
  }

  // 5) 기존 투자사 ID backfill(베스트에포트 — 실패해도 임포트 계속)
  for (const [id, operId] of backfill) {
    const { error } = await supabase
      .from("investors")
      .update({ diva_oper_inst_id: operId })
      .eq("id", id);
    if (!error) byOperId.set(operId, id);
  }

  // 행 → investorId 해석기(생성/매칭 반영 후)
  const resolveInvestor = (r: FundImportRow): string | null => {
    const operId = clean(r.oper_inst_id);
    const operNm = clean(r.oper_inst_nm);
    const nKey = operNm ? norm(operNm) : "";
    return (operId && byOperId.get(operId)) || (nKey && byName.get(nKey)) || null;
  };

  // 6) 조합 payload 구성 + (투자사,조합ID) 파일 내 중복 제거
  type Item = { investorId: string; p: DivaPayload };
  const items: Item[] = [];
  const seenPair = new Set<string>();
  for (const r of valid) {
    const investorId = resolveInvestor(r);
    if (!investorId) continue; // 이론상 없음(전부 생성/매칭됨)
    const asctId = clean(r.diva_asct_id);
    const pairKey = `${investorId}:${asctId ?? norm(clean(r.asct_nm)!)}`;
    if (seenPair.has(pairKey)) continue;
    seenPair.add(pairKey);
    items.push({
      investorId,
      p: {
        name: clean(r.asct_nm)!,
        aum: num(clean(r.aum ?? null)),
        vintage: yearOf(clean(r.reg_date ?? null)),
        formation_date: dateOrNull(clean(r.reg_date ?? null)),
        maturity_date: dateOrNull(clean(r.maturity_date ?? null)),
        sector_focus: sectors(clean(r.invst_fld ?? null)),
        main_purpose: purposeOrNull(clean(r.purpose ?? null)),
        diva_asct_id: asctId,
      },
    });
  }

  // 7) 기존 조합 조회 → 조합ID/이름으로 갱신 대상 판정. 투자사 id가 많아(.in URL
  //    과대) 전체를 받아 메모리에서 매핑한다(funds 규모는 수천 건 수준).
  const { data: existingFunds, error: efErr } = await supabase
    .from("funds")
    .select("id, investor_id, name, diva_asct_id");
  if (efErr) return { ok: false, error: efErr.message };

  const fundByAsct = new Map<string, string>();
  const fundByName = new Map<string, string>();
  for (const f of existingFunds ?? []) {
    const inv = f.investor_id as string;
    if (f.diva_asct_id) fundByAsct.set(`${inv}:${f.diva_asct_id}`, f.id as string);
    fundByName.set(`${inv}:${norm(f.name as string)}`, f.id as string);
  }

  const toInsert: (DivaPayload & { investor_id: string })[] = [];
  const toUpdate: { id: string; p: DivaPayload }[] = [];
  for (const { investorId, p } of items) {
    const existingId =
      (p.diva_asct_id && fundByAsct.get(`${investorId}:${p.diva_asct_id}`)) ||
      fundByName.get(`${investorId}:${norm(p.name)}`);
    if (existingId) toUpdate.push({ id: existingId, p });
    else toInsert.push({ investor_id: investorId, ...p });
  }

  // 8) 실행 — insert는 배치로
  let fundsCreated = 0;
  for (const batch of chunk(toInsert, 500)) {
    const { data, error } = await supabase
      .from("funds")
      .insert(batch)
      .select("id");
    if (error) return { ok: false, error: `조합 적재 실패: ${error.message}` };
    fundsCreated += data?.length ?? batch.length;
  }
  let fundsUpdated = 0;
  for (const u of toUpdate) {
    const { error } = await supabase.from("funds").update(u.p).eq("id", u.id);
    if (error) return { ok: false, error: `조합 갱신 실패: ${error.message}` };
    fundsUpdated++;
  }

  revalidatePath("/investors");

  return {
    ok: true,
    summary: {
      investorsCreated,
      investorsMatched: matchedExisting,
      fundsCreated,
      fundsUpdated,
      skipped,
    },
  };
}

// ---- 수기 매칭(미매칭 기존 투자사 ↔ DIVA 운용사) ----------------------------
// 가져오기 후, 이름이 달라 자동 매칭되지 않은 기존 투자사를 DIVA 운용사에 직접
// 연결한다. DIVA에 없는 투자사는 그냥 두면 된다(연결 안 함).

export type DivaMatchData = {
  // diva_oper_inst_id 가 없는(=DIVA 미연결) 기존 투자사
  unmatched: { id: string; name: string }[];
  // diva_oper_inst_id 가 있는(=DIVA 운용사) 투자사 — 연결 후보
  divaOptions: { id: string; label: string }[];
};

export async function getDivaMatchData(): Promise<DivaMatchData> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("investors")
    .select("id, name, diva_oper_inst_id")
    .order("name");
  const rows = (data ?? []) as {
    id: string;
    name: string;
    diva_oper_inst_id: string | null;
  }[];
  return {
    unmatched: rows
      .filter((r) => !r.diva_oper_inst_id)
      .map((r) => ({ id: r.id, name: r.name })),
    divaOptions: rows
      .filter((r) => r.diva_oper_inst_id)
      .map((r) => ({ id: r.id, label: r.name })),
  };
}

// 미매칭 투자사(keep)에 DIVA 운용사(diva)를 병합: diva의 조합을 keep로 옮기고
// (중복 조합ID는 제외), diva 투자사를 삭제한 뒤 keep에 운용사ID를 부여한다.
export async function mergeInvestorWithDiva(
  keepId: string,
  divaId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (keepId === divaId) return { ok: false, error: "같은 투자사입니다." };
  const supabase = await createClient();

  const { data: diva, error: dErr } = await supabase
    .from("investors")
    .select("id, diva_oper_inst_id")
    .eq("id", divaId)
    .single();
  if (dErr || !diva)
    return { ok: false, error: dErr?.message ?? "대상 투자사를 찾지 못했습니다." };
  const operId = diva.diva_oper_inst_id as string | null;

  // keep가 이미 가진 조합ID(중복 이관 시 유니크 위반 방지)
  const { data: keepFunds } = await supabase
    .from("funds")
    .select("diva_asct_id")
    .eq("investor_id", keepId);
  const keepAsct = new Set(
    (keepFunds ?? []).map((f) => f.diva_asct_id).filter(Boolean),
  );

  // diva의 조합 중 keep에 없는 것만 이관(겹치는 건 diva 삭제 시 함께 제거)
  const { data: divaFunds } = await supabase
    .from("funds")
    .select("id, diva_asct_id")
    .eq("investor_id", divaId);
  const moveIds = (divaFunds ?? [])
    .filter((f) => !f.diva_asct_id || !keepAsct.has(f.diva_asct_id))
    .map((f) => f.id);
  if (moveIds.length > 0) {
    const { error } = await supabase
      .from("funds")
      .update({ investor_id: keepId })
      .in("id", moveIds);
    if (error) return { ok: false, error: `조합 이관 실패: ${error.message}` };
  }

  // diva 투자사 삭제(운용사ID 유니크를 비우기 위해 keep 갱신 전에 먼저 삭제)
  const { error: delErr } = await supabase
    .from("investors")
    .delete()
    .eq("id", divaId);
  if (delErr) return { ok: false, error: `투자사 병합 실패: ${delErr.message}` };

  if (operId) {
    const { error } = await supabase
      .from("investors")
      .update({ diva_oper_inst_id: operId })
      .eq("id", keepId);
    if (error) return { ok: false, error: `운용사ID 연결 실패: ${error.message}` };
  }

  revalidatePath("/investors");
  revalidatePath("/import/funds");
  return { ok: true };
}
