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
import { HOLDING_FUND_STATUSES, type HoldingFund } from "@/lib/types";
import { Field } from "@/components/app/field";
import {
  createHoldingFund,
  updateHoldingFund,
  type ActionResult,
} from "../actions";

export function HoldingFundFormDialog({
  trigger,
  fund,
}: {
  trigger: React.ReactNode;
  fund?: HoldingFund;
}) {
  const isEdit = Boolean(fund);
  const [state, formAction, pending] = useActionState<
    ActionResult | undefined,
    FormData
  >(isEdit ? updateHoldingFund : createHoldingFund, undefined);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (state?.ok) setOpen(false);
  }, [state]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[90svh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? "운용펀드 수정" : "새 운용펀드 등록"}
          </DialogTitle>
          <DialogDescription>
            우리가 운용·매각하는 펀드(예: 스파크랩 N호) 정보를 입력합니다.
          </DialogDescription>
        </DialogHeader>

        <form action={formAction} className="space-y-4">
          {isEdit && <input type="hidden" name="id" value={fund!.id} />}

          <div className="grid grid-cols-2 gap-4">
            <Field label="운용펀드명(전체)" htmlFor="hf-name" required>
              <Input
                id="hf-name"
                name="name"
                placeholder="스파크랩 벤처스 N호 투자조합"
                defaultValue={fund?.name ?? ""}
                required
              />
            </Field>
            <Field
              label="약칭"
              htmlFor="hf-short"
              hint="화면에는 약칭이 표시됩니다."
            >
              <Input
                id="hf-short"
                name="short_name"
                placeholder="스파크랩 N호"
                defaultValue={fund?.short_name ?? ""}
              />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Field label="결성연도(vintage)" htmlFor="hf-vintage">
              <Input
                id="hf-vintage"
                name="vintage"
                inputMode="numeric"
                placeholder="2018"
                defaultValue={fund?.vintage ?? ""}
              />
            </Field>
            <Field label="상태">
              <Select name="status" defaultValue={fund?.status ?? undefined}>
                <SelectTrigger>
                  <SelectValue placeholder="선택" />
                </SelectTrigger>
                <SelectContent>
                  {HOLDING_FUND_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>

          <Field label="만기일" htmlFor="hf-maturity" hint="EXIT 압박의 원천">
            <Input
              id="hf-maturity"
              name="maturity_date"
              type="date"
              defaultValue={fund?.maturity_date ?? ""}
            />
          </Field>

          <Field label="메모" htmlFor="hf-notes">
            <Textarea
              id="hf-notes"
              name="notes"
              defaultValue={fund?.notes ?? ""}
            />
          </Field>

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
