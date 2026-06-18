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
import {
  SECONDARY_APPETITES,
  STAGE_FOCUS_OPTIONS,
  type Fund,
} from "@/lib/types";
import { Field } from "@/components/app/field";
import { createFund, updateFund, type ActionResult } from "../actions";

export function FundFormDialog({
  trigger,
  investorId,
  fund,
}: {
  trigger: React.ReactNode;
  investorId: string;
  fund?: Fund;
}) {
  const isEdit = Boolean(fund);
  const [state, formAction, pending] = useActionState<
    ActionResult | undefined,
    FormData
  >(isEdit ? updateFund : createFund, undefined);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (state?.ok) setOpen(false);
  }, [state]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? "조합 수정" : "새 조합 등록"}</DialogTitle>
          <DialogDescription>
            이 투자사가 운용하는 펀드(조합) 정보를 입력합니다.
          </DialogDescription>
        </DialogHeader>

        <form action={formAction} className="space-y-4">
          <input type="hidden" name="investor_id" value={investorId} />
          {isEdit && <input type="hidden" name="id" value={fund!.id} />}

          <Field label="조합명" htmlFor="fund-name" required>
            <Input
              id="fund-name"
              name="name"
              defaultValue={fund?.name ?? ""}
              required
            />
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field label="결성일" htmlFor="formation_date">
              <Input
                id="formation_date"
                name="formation_date"
                type="date"
                defaultValue={
                  fund?.formation_date ??
                  (fund?.vintage ? `${fund.vintage}-01-01` : "")
                }
              />
            </Field>
            <Field label="구주 인수 선호도">
              <Select
                name="secondary_appetite"
                defaultValue={fund?.secondary_appetite ?? undefined}
              >
                <SelectTrigger>
                  <SelectValue placeholder="선택" />
                </SelectTrigger>
                <SelectContent>
                  {SECONDARY_APPETITES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Field label="결성총액 AUM (KRW)" htmlFor="aum">
              <Input
                id="aum"
                name="aum"
                inputMode="numeric"
                placeholder="100000000000"
                defaultValue={fund?.aum ?? ""}
              />
            </Field>
            <Field label="드라이파우더 (KRW)" htmlFor="dry_powder">
              <Input
                id="dry_powder"
                name="dry_powder"
                inputMode="numeric"
                placeholder="30000000000"
                defaultValue={fund?.dry_powder ?? ""}
              />
            </Field>
          </div>

          <Field label="주목적" htmlFor="main_purpose">
            <Input
              id="main_purpose"
              name="main_purpose"
              defaultValue={fund?.main_purpose ?? ""}
            />
          </Field>

          <Field
            label="투자단계 focus"
            htmlFor="stage_focus"
            hint={`쉼표로 구분 (예: ${STAGE_FOCUS_OPTIONS.join(", ")})`}
          >
            <Input
              id="stage_focus"
              name="stage_focus"
              defaultValue={fund?.stage_focus?.join(", ") ?? ""}
            />
          </Field>

          <Field
            label="섹터 focus"
            htmlFor="sector_focus"
            hint="쉼표로 구분 (예: AI, 헬스케어, 핀테크)"
          >
            <Input
              id="sector_focus"
              name="sector_focus"
              defaultValue={fund?.sector_focus?.join(", ") ?? ""}
            />
          </Field>

          <div className="grid grid-cols-3 gap-4">
            <Field label="만기일" htmlFor="maturity_date">
              <Input
                id="maturity_date"
                name="maturity_date"
                type="date"
                defaultValue={fund?.maturity_date ?? ""}
              />
            </Field>
            <Field label="최소 투자(KRW)" htmlFor="check_size_min">
              <Input
                id="check_size_min"
                name="check_size_min"
                inputMode="numeric"
                defaultValue={fund?.check_size_min ?? ""}
              />
            </Field>
            <Field label="최대 투자(KRW)" htmlFor="check_size_max">
              <Input
                id="check_size_max"
                name="check_size_max"
                inputMode="numeric"
                defaultValue={fund?.check_size_max ?? ""}
              />
            </Field>
          </div>

          <Field label="메모" htmlFor="fund-notes">
            <Textarea
              id="fund-notes"
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
