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
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  LISTING_STATUS_LABEL,
  SECTOR_OPTIONS,
  SELECTABLE_LISTING_STATUSES,
  type HoldingFund,
  type Listing,
} from "@/lib/types";
import { Field } from "@/components/app/field";
import {
  createListing,
  getListingRounds,
  updateListing,
  type ActionResult,
} from "../actions";
import { RoundsEditor, type RoundSeed } from "./rounds-editor";

export function ListingFormDialog({
  trigger,
  listing,
  selectedFundIds = [],
  holdingFunds,
}: {
  trigger: React.ReactNode;
  listing?: Listing;
  selectedFundIds?: string[];
  holdingFunds: HoldingFund[];
}) {
  const isEdit = Boolean(listing);
  const [state, formAction, pending] = useActionState<
    ActionResult | undefined,
    FormData
  >(isEdit ? updateListing : createListing, undefined);
  const [open, setOpen] = useState(false);

  // 수정 모드: 저장된 투자 라운드를 다이얼로그 열 때 지연 로드(프리필).
  const [roundsSeed, setRoundsSeed] = useState<RoundSeed[] | null>(
    isEdit ? null : [],
  );
  const [roundsLoading, setRoundsLoading] = useState(false);

  useEffect(() => {
    if (state?.ok) setOpen(false);
  }, [state]);

  useEffect(() => {
    if (!open || !isEdit || !listing) return;
    let cancelled = false;
    setRoundsLoading(true);
    setRoundsSeed(null);
    getListingRounds(listing.id).then((res) => {
      if (cancelled) return;
      setRoundsSeed(
        res.ok
          ? res.rounds.map((r) => ({
              label: r.label,
              unit_price: r.unit_price,
              shares: r.shares,
              amount: r.amount,
            }))
          : [],
      );
      setRoundsLoading(false);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, isEdit, listing?.id]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? "매물 수정" : "새 매물 등록"}</DialogTitle>
          <DialogDescription>
            포트폴리오사 구주를 매물로 등록합니다. 투자 데이터(라운드별 단가·주식수)는
            선택 입력이며 EXIT 시나리오 계산에 사용됩니다.
          </DialogDescription>
        </DialogHeader>

        <form action={formAction} className="space-y-4">
          {isEdit && <input type="hidden" name="id" value={listing!.id} />}

          <div className="grid grid-cols-2 gap-4">
            <Field label="회사명" htmlFor="company_name" required>
              <Input
                id="company_name"
                name="company_name"
                defaultValue={listing?.company_name ?? ""}
                required
              />
            </Field>
            <Field label="상태">
              <Select
                name="status"
                defaultValue={listing?.status ?? "LIVE"}
              >
                <SelectTrigger>
                  <SelectValue placeholder="선택" />
                </SelectTrigger>
                <SelectContent>
                  {SELECTABLE_LISTING_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {LISTING_STATUS_LABEL[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Field label="섹터">
              <Select name="sector" defaultValue={listing?.sector ?? undefined}>
                <SelectTrigger>
                  <SelectValue placeholder="선택" />
                </SelectTrigger>
                <SelectContent>
                  {SECTOR_OPTIONS.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="단계(stage)" htmlFor="stage">
              <Input
                id="stage"
                name="stage"
                placeholder="Series B 등"
                defaultValue={listing?.stage ?? ""}
              />
            </Field>
          </div>

          <Field label="IR/티저 자료 링크" htmlFor="deck_url">
            <Input
              id="deck_url"
              name="deck_url"
              type="url"
              placeholder="https://"
              defaultValue={listing?.deck_url ?? ""}
            />
          </Field>

          {/* 운용펀드 태깅 (ListingFund) — 여러 펀드 중복 소속 허용 */}
          <div className="space-y-2 rounded-lg border border-border p-3">
            <p className="text-sm font-medium">소속 운용펀드</p>
            {holdingFunds.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                등록된 운용펀드가 없습니다. 먼저 “운용펀드 관리”에서 펀드를
                등록하세요.
              </p>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2">
                {holdingFunds.map((hf) => (
                  <div key={hf.id} className="flex items-center gap-2">
                    <Checkbox
                      id={`hf-${hf.id}`}
                      name="holding_fund_ids"
                      value={hf.id}
                      defaultChecked={selectedFundIds.includes(hf.id)}
                    />
                    <Label htmlFor={`hf-${hf.id}`} className="font-normal">
                      {hf.name}
                    </Label>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 투자 데이터(선택) — EXIT 시나리오 소스 */}
          {isEdit && roundsSeed === null ? (
            <div className="rounded-lg border border-border p-3 text-sm text-muted-foreground">
              투자 데이터 불러오는 중…
            </div>
          ) : (
            <RoundsEditor initial={roundsSeed ?? []} />
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
            <Button type="submit" disabled={pending || (isEdit && roundsLoading)}>
              {pending ? "저장 중…" : "저장"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
