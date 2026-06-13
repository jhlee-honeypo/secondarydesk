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
import { MoneyInput } from "@/components/app/money-input";
import {
  createHoldingFund,
  updateHoldingFund,
  type ActionResult,
} from "../actions";
import { lookupBubbleFunds } from "../bubble-actions";
import { BubbleLookup } from "./bubble-lookup";

// ISO 일시 → KST 달력 날짜(YYYY-MM-DD). Bubble 날짜는 UTC 로 저장돼 있어
// 그대로 자르면 하루가 밀릴 수 있으므로 +9h 보정 후 자른다.
function isoToKstDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return new Date(d.getTime() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

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

  // Bubble 프리필 대상 필드만 제어형으로 둔다.
  const [name, setName] = useState(fund?.name ?? "");
  const [commitment, setCommitment] = useState<number | null>(
    fund?.commitment ?? null,
  );
  const [vintage, setVintage] = useState(
    fund?.vintage != null ? String(fund.vintage) : "",
  );
  const [maturity, setMaturity] = useState(fund?.maturity_date ?? "");

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

          {/* Bubble(sparkERP)에서 조합 불러오기 — 약정액·결성연도·만기 자동 채움 */}
          <BubbleLookup
            label="sparkERP에서 조합 불러오기"
            placeholder="조합명 검색 (예: SKF3)"
            search={lookupBubbleFunds}
            onPick={(f) => {
              setName(f.name);
              setCommitment(f.size);
              setVintage(f.startDate ? isoToKstDate(f.startDate).slice(0, 4) : "");
              setMaturity(isoToKstDate(f.endDate));
            }}
            renderItem={(f) => (
              <span className="flex items-center justify-between gap-2">
                <span className="font-medium">{f.name}</span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {f.size != null
                    ? `${Math.round(f.size / 100000000)}억`
                    : ""}
                  {f.endDate ? ` · 만기 ${isoToKstDate(f.endDate)}` : ""}
                </span>
              </span>
            )}
          />

          <div className="grid grid-cols-2 gap-4">
            <Field label="운용펀드명(전체)" htmlFor="hf-name" required>
              <Input
                id="hf-name"
                name="name"
                placeholder="스파크랩 벤처스 N호 투자조합"
                value={name}
                onChange={(e) => setName(e.target.value)}
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
            <Field label="약정액(원)" htmlFor="hf-commitment">
              <MoneyInput
                id="hf-commitment"
                name="commitment"
                placeholder="6,310,000,000"
                value={commitment}
                onValueChange={setCommitment}
              />
            </Field>
            <Field label="결성연도(vintage)" htmlFor="hf-vintage">
              <Input
                id="hf-vintage"
                name="vintage"
                inputMode="numeric"
                placeholder="2018"
                value={vintage}
                onChange={(e) => setVintage(e.target.value)}
              />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-4">
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
            <Field label="만기일" htmlFor="hf-maturity" hint="EXIT 압박의 원천">
              <Input
                id="hf-maturity"
                name="maturity_date"
                type="date"
                value={maturity}
                onChange={(e) => setMaturity(e.target.value)}
              />
            </Field>
          </div>

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
