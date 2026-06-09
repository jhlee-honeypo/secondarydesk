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
import { DEAL_STAGES, type Deal, type UserRow } from "@/lib/types";
import { Field } from "@/components/app/field";
import { MoneyInput } from "@/components/app/money-input";
import { createDeal, updateDeal, type ActionResult } from "../actions";

export type DealOptionListing = { id: string; company_name: string };
export type DealOptionInvestor = { id: string; name: string };
export type DealOptionFund = { id: string; name: string; investor_id: string };

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
  const [investorId, setInvestorId] = useState(fixedInvestorId ?? "");

  useEffect(() => {
    if (state?.ok) setOpen(false);
  }, [state]);

  const investorFunds = funds.filter((f) => f.investor_id === investorId);

  const lockedListing = listings.find((l) => l.id === (deal?.listing_id ?? lockListingId));
  const lockedInvestor = investors.find((i) => i.id === fixedInvestorId);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? "딜 수정" : "새 딜 생성"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "딜 단계·담당자·다음 액션 등을 수정합니다."
              : "매물과 투자사를 선택해 딜을 만듭니다 = 이 매물을 이 투자사에 소개함."}
          </DialogDescription>
        </DialogHeader>

        <form action={formAction} className="space-y-4">
          {isEdit && <input type="hidden" name="id" value={deal!.id} />}

          {/* 매물 × 투자사 (딜 정체성) — 생성 시 선택, 수정/잠금 시 고정 표시 */}
          <div className="grid grid-cols-2 gap-4">
            <Field label="매물" required>
              {isEdit || lockListingId ? (
                <>
                  <input
                    type="hidden"
                    name="listing_id"
                    value={deal?.listing_id ?? lockListingId}
                  />
                  <div className="flex h-9 items-center rounded-lg border border-input bg-muted/40 px-3 text-sm">
                    {lockedListing?.company_name ?? "—"}
                  </div>
                </>
              ) : (
                <Select name="listing_id" required>
                  <SelectTrigger>
                    <SelectValue placeholder="매물 선택" />
                  </SelectTrigger>
                  <SelectContent>
                    {listings.map((l) => (
                      <SelectItem key={l.id} value={l.id}>
                        {l.company_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </Field>

            <Field label="투자사" required>
              {isEdit || lockInvestorId ? (
                <>
                  <input
                    type="hidden"
                    name="investor_id"
                    value={fixedInvestorId}
                  />
                  <div className="flex h-9 items-center rounded-lg border border-input bg-muted/40 px-3 text-sm">
                    {lockedInvestor?.name ?? "—"}
                  </div>
                </>
              ) : (
                <Select
                  name="investor_id"
                  required
                  value={investorId || undefined}
                  onValueChange={setInvestorId}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="투자사 선택" />
                  </SelectTrigger>
                  <SelectContent>
                    {investors.map((i) => (
                      <SelectItem key={i.id} value={i.id}>
                        {i.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </Field>
          </div>

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

          <div className="grid grid-cols-2 gap-4">
            <Field label="단계">
              <Select
                name="stage"
                defaultValue={deal?.stage ?? "컨택"}
              >
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
            <Field label="예상 거래 규모 (KRW)" htmlFor="expected_amount">
              <MoneyInput
                id="expected_amount"
                name="expected_amount"
                placeholder="10,000,000,000"
                defaultValue={deal?.expected_amount}
              />
            </Field>
          </div>

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

          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                취소
              </Button>
            </DialogClose>
            <Button type="submit" disabled={pending}>
              {pending ? "저장 중…" : "저장"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
