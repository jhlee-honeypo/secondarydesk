"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/supabase/auth";

export type ActionResult = { ok: true } | { ok: false; error: string };

// ---- 파싱 헬퍼 -------------------------------------------------------------

function text(fd: FormData, key: string): string | null {
  const v = fd.get(key);
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t === "" ? null : t;
}

function requiredText(fd: FormData, key: string): string {
  return text(fd, key) ?? "";
}

function num(fd: FormData, key: string): number | null {
  const t = text(fd, key);
  if (t === null) return null;
  const n = Number(t.replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

function intNum(fd: FormData, key: string): number | null {
  const n = num(fd, key);
  return n === null ? null : Math.trunc(n);
}

// 쉼표로 구분된 입력을 text[] 로 변환
function tags(fd: FormData, key: string): string[] | null {
  const t = text(fd, key);
  if (t === null) return null;
  const arr = t
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return arr.length ? arr : null;
}

function bool(fd: FormData, key: string): boolean {
  const v = fd.get(key);
  return v === "on" || v === "true";
}

// ---- 투자사 (Investor) -----------------------------------------------------

// 쉼표 인덱스 매칭용: FormDataEntryValue → 정리된 문자열 또는 null
function entryText(v: FormDataEntryValue | undefined): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t === "" ? null : t;
}

export async function createInvestor(
  _prev: ActionResult | undefined,
  fd: FormData,
): Promise<ActionResult> {
  const name = requiredText(fd, "name");
  if (!name) return { ok: false, error: "투자사명을 입력하세요." };

  const supabase = await createClient();
  const me = await getCurrentUser();

  // 1) 투자사 생성 (유형은 선택값)
  const { data: inserted, error } = await supabase
    .from("investors")
    .insert({
      name,
      type: text(fd, "type"),
      description: text(fd, "description"),
      owner_id: text(fd, "owner_id") ?? me?.id ?? null,
    })
    .select("id")
    .single();

  if (error || !inserted) {
    return { ok: false, error: error?.message ?? "투자사 등록에 실패했습니다." };
  }

  const investorId = inserted.id as string;

  // 2) 컨택 심사역 (이름이 있을 때만 함께 등록)
  const contactName = text(fd, "contact_name");
  if (contactName) {
    await supabase.from("contacts").insert({
      investor_id: investorId,
      name: contactName,
      title: text(fd, "contact_title"),
    });
  }

  // 3) 조합 (행별 조합명이 있는 것만 등록)
  const fundNames = fd.getAll("fund_name");
  const fundPurposes = fd.getAll("fund_main_purpose");
  const fundNotes = fd.getAll("fund_notes");
  const fundsToInsert = fundNames
    .map((raw, i) => ({
      name: entryText(raw),
      main_purpose: entryText(fundPurposes[i]),
      notes: entryText(fundNotes[i]),
    }))
    .filter((f): f is { name: string; main_purpose: string | null; notes: string | null } =>
      Boolean(f.name),
    )
    .map((f) => ({ investor_id: investorId, ...f }));

  if (fundsToInsert.length > 0) {
    await supabase.from("funds").insert(fundsToInsert);
  }

  revalidatePath("/investors");
  return { ok: true };
}

export async function updateInvestor(
  _prev: ActionResult | undefined,
  fd: FormData,
): Promise<ActionResult> {
  const id = requiredText(fd, "id");
  const name = requiredText(fd, "name");
  if (!id) return { ok: false, error: "잘못된 요청입니다." };
  if (!name) return { ok: false, error: "투자사명을 입력하세요." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("investors")
    .update({
      name,
      type: text(fd, "type"),
      description: text(fd, "description"),
      owner_id: text(fd, "owner_id"),
    })
    .eq("id", id);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/investors");
  revalidatePath(`/investors/${id}`);
  return { ok: true };
}

export async function deleteInvestor(id: string): Promise<void> {
  const supabase = await createClient();
  await supabase.from("investors").delete().eq("id", id);
  revalidatePath("/investors");
  redirect("/investors");
}

// ---- 조합 (Fund) -----------------------------------------------------------

function fundPayload(fd: FormData) {
  return {
    name: requiredText(fd, "name"),
    vintage: intNum(fd, "vintage"),
    aum: num(fd, "aum"),
    dry_powder: num(fd, "dry_powder"),
    main_purpose: text(fd, "main_purpose"),
    stage_focus: tags(fd, "stage_focus"),
    sector_focus: tags(fd, "sector_focus"),
    maturity_date: text(fd, "maturity_date"),
    check_size_min: num(fd, "check_size_min"),
    check_size_max: num(fd, "check_size_max"),
    secondary_appetite: text(fd, "secondary_appetite"),
    notes: text(fd, "notes"),
  };
}

export async function createFund(
  _prev: ActionResult | undefined,
  fd: FormData,
): Promise<ActionResult> {
  const investorId = requiredText(fd, "investor_id");
  const payload = fundPayload(fd);
  if (!investorId) return { ok: false, error: "잘못된 요청입니다." };
  if (!payload.name) return { ok: false, error: "조합명을 입력하세요." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("funds")
    .insert({ investor_id: investorId, ...payload });

  if (error) return { ok: false, error: error.message };

  revalidatePath(`/investors/${investorId}`);
  return { ok: true };
}

export async function updateFund(
  _prev: ActionResult | undefined,
  fd: FormData,
): Promise<ActionResult> {
  const id = requiredText(fd, "id");
  const investorId = requiredText(fd, "investor_id");
  const payload = fundPayload(fd);
  if (!id || !investorId) return { ok: false, error: "잘못된 요청입니다." };
  if (!payload.name) return { ok: false, error: "조합명을 입력하세요." };

  const supabase = await createClient();
  const { error } = await supabase.from("funds").update(payload).eq("id", id);

  if (error) return { ok: false, error: error.message };

  revalidatePath(`/investors/${investorId}`);
  return { ok: true };
}

export async function deleteFund(
  id: string,
  investorId: string,
): Promise<void> {
  const supabase = await createClient();
  await supabase.from("funds").delete().eq("id", id);
  revalidatePath(`/investors/${investorId}`);
}

// ---- 컨택 (Contact) --------------------------------------------------------

function contactPayload(fd: FormData) {
  return {
    name: requiredText(fd, "name"),
    title: text(fd, "title"),
    is_decision_maker: bool(fd, "is_decision_maker"),
    email: text(fd, "email"),
    phone: text(fd, "phone"),
    notes: text(fd, "notes"),
  };
}

export async function createContact(
  _prev: ActionResult | undefined,
  fd: FormData,
): Promise<ActionResult> {
  const investorId = requiredText(fd, "investor_id");
  const payload = contactPayload(fd);
  if (!investorId) return { ok: false, error: "잘못된 요청입니다." };
  if (!payload.name) return { ok: false, error: "이름을 입력하세요." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("contacts")
    .insert({ investor_id: investorId, ...payload });

  if (error) return { ok: false, error: error.message };

  revalidatePath(`/investors/${investorId}`);
  return { ok: true };
}

export async function updateContact(
  _prev: ActionResult | undefined,
  fd: FormData,
): Promise<ActionResult> {
  const id = requiredText(fd, "id");
  const investorId = requiredText(fd, "investor_id");
  const payload = contactPayload(fd);
  if (!id || !investorId) return { ok: false, error: "잘못된 요청입니다." };
  if (!payload.name) return { ok: false, error: "이름을 입력하세요." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("contacts")
    .update(payload)
    .eq("id", id);

  if (error) return { ok: false, error: error.message };

  revalidatePath(`/investors/${investorId}`);
  return { ok: true };
}

export async function deleteContact(
  id: string,
  investorId: string,
): Promise<void> {
  const supabase = await createClient();
  await supabase.from("contacts").delete().eq("id", id);
  revalidatePath(`/investors/${investorId}`);
}
