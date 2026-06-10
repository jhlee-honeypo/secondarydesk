"use client";

import { useActionState, useEffect, useState } from "react";

import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { DEAL_STAGES, type Deal, type UserRow } from "@/lib/types";
import { Field } from "@/components/app/field";
import { MoneyInput } from "@/components/app/money-input";
import { InvestorPicker } from "@/components/app/investor-picker";
import { createDeal, updateDeal, type ActionResult } from "../actions";

export type DealOptionListing = { id: string; company_name: string };
export type DealOptionInvestor = { id: string; name: string };
export type DealOptionFund = { id: string; name: string; investor_id: string };

/**
 * 매물 복수 선택(생성 시) — 검색 + 체크박스 목록. 선택값은 hidden input
 * (name="listing_ids")으로 폼에 실려 서버 액션이 매물마다 딜을 생성한다.
 */
function ListingMultiSelect({
  listings,
  value,
  onChange,
}: {
  listings: DealOptionListing[];
  value: string[];
  onChange: (next: string[]) => void;
}) {
  const [q, setQ] = useState("");
  const query = q.trim().toLowerCase();
  const filtered = query
    ? listings.filter((l) => l.company_name.toLowerCase().includes(query))
    : listings;

  function toggle(id: string) {
    onChange(
      value.includes(id) ? value.filter((v) => v !== id) : [...value, id],
    );
  }

  return (
    <div className="space-y-2">
      {value.map((id) => (
        <input key={id} type="hidden" name="listing_ids" value={id} />
      ))}
      <Input
        placeholder="매물 검색…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      <div className="max-h-48 divide-y divide-border overflow-y-auto rounded-lg border border-input">
        {filtered.length === 0 ? (
          <p className="px-3 py-4 text-center text-sm text-muted-foreground">
            {listings.length === 0 ? "등록된 매물이 없습니다." : "검색 결과 없음"}
          </p>
        ) : (
          filtered.map((l) => (
            <label
              key={l.id}
              className="flex cursor-pointer items-center gap-2 px-3 py-2 text-sm hover:bg-muted/40"
            >
              <Checkbox
                checked={value.includes(l.id)}
                onCheckedChange={() => toggle(l.id)}
              />
              {l.company_name}
            </label>
          ))
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        {value.length}개 매물 선택됨{value.length > 1 ? " — 각각 딜이 생성됩니다." : ""}
      </p>
    </div>
  );
}

export function DealFormDialog({
  trigger,
  deal,
  listings,
  investors,
  funds,
  users,
  currentUserId,
  lockListingId,
  lockInvestorId,
}: {
  trigger: React.ReactNode;
  deal?: Deal;
  listings: DealOptionListing[];
  investors: DealOptionInvestor[];
  funds: DealOptionFund[];
  users: UserRow[];
  currentUserId: string;
  lockListingId?: string;
  lockInvestorId?: string;
}) {
  const isEdit = Boolean(deal);
  const [state, formAction, pending] = useActionState<
    ActionResult | undefined,
    FormData
  >(isEdit ? updateDeal : createDeal, undefined);
  const [open, setOpen] = useState(false);

  // 조합(fund) cascade 를 위한 선택 투자사. 수정 모드는 딜의 투자사로 고정.
  const fixedInvestorId = deal?.investor_id ?? lockInvestorId;
  const [investorId] = useState(fixedInvestorId ?? "");

  // 생성 시 매물 복수 선택(매물 잠금/수정 모드가 아닐 때만 사용)
  const multiListing = !isEdit && !lockListingId;
  const [selectedListingIds, setSelectedListingIds] = useState<string[]>([]);

  // 생성 시 투자사: 기존 선택 ↔ 새 투자사 등록 토글(투자사 잠금/수정이 아닐 때만)
  const investorSelectable = !isEdit && !lockInvestorId;

  useEffect(() => {
    if (!state?.ok) return;
    // 건너뛴 매물(중복)이 있으면 요약을 보여주기 위해 다이얼로그를 닫지 않는다.
    if ((state.skipped ?? 0) > 0) {
      setSelectedListingIds([]);
    } else {
      setOpen(false);
    }
  }, [state]);

  // 닫힐 때 입력 상태 초기화(다음 생성에 잔존 방지)
  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) setSelectedListingIds([]);
  }

  const investorFunds = funds.filter((f) => f.investor_id === investorId);

  const lockedListing = listings.find((l) => l.id === (deal?.listing_id ?? lockListingId));
  const lockedInvestor = investors.find((i) => i.id === fixedInvestorId);

  // 매물 필드: 수정/잠금이면 단일 고정, 생성이면 복수 선택
  const listingField = multiListing ? (
    <Field
      label="매물"
      required
      hint="한 투자사에 여러 매물을 한꺼번에 소개할 수 있습니다."
    >
      <ListingMultiSelect
        listings={listings}
        value={selectedListingIds}
        onChange={setSelectedListingIds}
      />
    </Field>
  ) : (
    <Field label="매물" required>
      <input
        type="hidden"
        name="listing_ids"
        value={deal?.listing_id ?? lockListingId}
      />
      <div className="flex h-9 items-center rounded-lg border border-input bg-muted/40 px-3 text-sm">
        {lockedListing?.company_name ?? "—"}
      </div>
    </Field>
  );

  // 투자사 필드:
  //  - 수정/잠금: 고정 표시
  //  - 생성: 기존 투자사 선택 ↔ 새 투자사 등록 토글(InvestorPicker 공용)
  const investorField = !investorSelectable ? (
    <Field label="투자사" required>
      <input type="hidden" name="investor_id" value={fixedInvestorId} />
      <div className="flex h-9 items-center rounded-lg border border-input bg-muted/40 px-3 text-sm">
        {lockedInvestor?.name ?? "—"}
      </div>
    </Field>
  ) : (
    <InvestorPicker investors={investors} />
  );

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? "딜 수정" : "새 딜 생성"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "딜 단계·담당자·다음 액션 등을 수정합니다."
              : "투자사(신규 등록 또는 기존 선택)와 소개할 매물을 골라 딜을 만듭니다. 매물을 여러 개 선택하면 매물마다 딜이 생성됩니다."}
          </DialogDescription>
        </DialogHeader>

        <form action={formAction} className="space-y-4">
          {isEdit && <input type="hidden" name="id" value={deal!.id} />}

          {/* 매물 · 투자사 (딜 정체성) — 생성 시 매물 복수 선택 + 투자사 등록/선택,
              수정·잠금 시 고정 표시. 세로로 쌓아 배치한다. */}
          <div className="space-y-4">
            {listingField}
            {investorField}
          </div>

          {/* 단계 — 생성·수정 공통 */}
          <Field label="단계">
            <Select name="stage" defaultValue={deal?.stage ?? "컨택"}>
              <SelectTrigger>
                <SelectValue placeholder="선택" />
              </SelectTrigger>
              <SelectContent>
                {DEAL_STAGES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          {!isEdit && (
            <p className="text-xs text-muted-foreground">
              담당 심사역은 딜 생성자(나)로 지정됩니다. 조합·예상 규모·소개 경로·다음
              액션 등 상세는 생성 후 딜 수정에서 입력할 수 있습니다.
            </p>
          )}

          {/* 상세 입력은 수정 모드에서만 노출 */}
          {isEdit && (
            <>
              <div className="grid grid-cols-2 gap-4">
                <Field label="대상 조합">
                  <Select
                    name="fund_id"
                    defaultValue={deal?.fund_id ?? undefined}
                    disabled={!investorId}
                  >
                    <SelectTrigger>
                      <SelectValue
                        placeholder={
                          investorId
                            ? investorFunds.length
                              ? "선택"
                              : "등록된 조합 없음"
                            : "투자사 먼저 선택"
                        }
                      />
                    </SelectTrigger>
                    <SelectContent>
                      {investorFunds.map((f) => (
                        <SelectItem key={f.id} value={f.id}>
                          {f.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>

                <Field label="담당 심사역">
                  <Select
                    name="owner_id"
                    defaultValue={deal?.owner_id ?? currentUserId}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="선택" />
                    </SelectTrigger>
                    <SelectContent>
                      {users.map((u) => (
                        <SelectItem key={u.id} value={u.id}>
                          {u.name ?? u.email ?? u.id}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              </div>

              <Field label="예상 거래 규모 (KRW)" htmlFor="expected_amount">
                <MoneyInput
                  id="expected_amount"
                  name="expected_amount"
                  placeholder="10,000,000,000"
                  defaultValue={deal?.expected_amount}
                />
              </Field>

              {/* 소개 경로(F8) — 네트워크 추적: 소개자·관계·일자 */}
              <div className="space-y-3 rounded-lg border border-border p-3">
                <p className="text-sm font-medium">소개 경로</p>
                <div className="grid grid-cols-2 gap-4">
                  <Field label="소개자" htmlFor="intro_source">
                    <Input
                      id="intro_source"
                      name="intro_source"
                      placeholder="예: 김OO 대표"
                      defaultValue={deal?.intro_source ?? ""}
                    />
                  </Field>
                  <Field label="관계" htmlFor="intro_relationship">
                    <Input
                      id="intro_relationship"
                      name="intro_relationship"
                      placeholder="예: 포트폴리오사 대표"
                      defaultValue={deal?.intro_relationship ?? ""}
                    />
                  </Field>
                </div>
                <Field label="소개 일자" htmlFor="intro_date">
                  <Input
                    id="intro_date"
                    name="intro_date"
                    type="date"
                    defaultValue={deal?.intro_date ?? ""}
                  />
                </Field>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <Field label="다음 액션" htmlFor="next_action">
                  <Input
                    id="next_action"
                    name="next_action"
                    placeholder="예: 티저 발송"
                    defaultValue={deal?.next_action ?? ""}
                  />
                </Field>
                <Field label="다음 액션 예정일" htmlFor="next_action_date">
                  <Input
                    id="next_action_date"
                    name="next_action_date"
                    type="date"
                    defaultValue={deal?.next_action_date ?? ""}
                  />
                </Field>
              </div>
            </>
          )}

          {/* 수정 모드 전용 필드 */}
          {isEdit && (
            <div className="grid grid-cols-2 gap-4">
              <Field label="성사 확률 (%)" htmlFor="probability">
                <Input
                  id="probability"
                  name="probability"
                  inputMode="numeric"
                  placeholder="0–100"
                  defaultValue={deal?.probability ?? ""}
                />
              </Field>
              <Field label="목표 클로징일" htmlFor="target_close_date">
                <Input
                  id="target_close_date"
                  name="target_close_date"
                  type="date"
                  defaultValue={deal?.target_close_date ?? ""}
                />
              </Field>
            </div>
          )}

          {isEdit && (
            <Field
              label="드랍 사유"
              htmlFor="lost_reason"
              hint="Lost 단계로 옮긴 경우 사유 기록"
            >
              <Textarea
                id="lost_reason"
                name="lost_reason"
                defaultValue={deal?.lost_reason ?? ""}
              />
            </Field>
          )}

          {state && !state.ok && (
            <p className="text-sm text-destructive" role="alert">
              {state.error}
            </p>
          )}
          {state?.ok && (state.skipped ?? 0) > 0 && (
            <p className="text-sm text-foreground" role="status">
              딜 {state.created ?? 0}개를 생성했습니다.{" "}
              {state.skipped}개 매물은 이미 이 투자사에 딜이 있어 건너뛰었습니다.
            </p>
          )}

          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                {state?.ok ? "닫기" : "취소"}
              </Button>
            </DialogClose>
            <Button
              type="submit"
              disabled={
                pending || (multiListing && selectedListingIds.length === 0)
              }
            >
              {pending
                ? "저장 중…"
                : multiListing && selectedListingIds.length > 1
                  ? `딜 ${selectedListingIds.length}개 생성`
                  : "저장"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
