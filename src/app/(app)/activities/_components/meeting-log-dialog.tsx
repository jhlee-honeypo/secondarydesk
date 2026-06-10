"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { CheckCircle2 } from "lucide-react";

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
import { Field } from "@/components/app/field";
import {
  InvestorPicker,
  type InvestorOption,
} from "@/components/app/investor-picker";
import { ACTIVITY_TYPES } from "@/lib/types";
import { logMeeting, type MeetingResult } from "../actions";

function todayLocal(): string {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

/**
 * 매물 소개(딜) 없이 투자사 미팅(조합 정보 청취 등)을 기록하는 다이얼로그.
 * 투자사 신규/기존 토글을 딜 폼과 공유(InvestorPicker)하며, 제출 시 활동으로 누적.
 */
export function MeetingLogDialog({
  trigger,
  investors,
}: {
  trigger: React.ReactNode;
  investors: InvestorOption[];
}) {
  const [state, formAction, pending] = useActionState<
    MeetingResult | undefined,
    FormData
  >(logMeeting, undefined);
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>미팅 기록</DialogTitle>
          <DialogDescription>
            매물 소개 없이 투자사를 만나 조합 정보 등을 들은 경우를 기록합니다.
            투자사 활동 타임라인에 누적됩니다.
          </DialogDescription>
        </DialogHeader>

        <form action={formAction} className="space-y-4">
          <InvestorPicker investors={investors} showMetDate={false} />

          <div className="grid grid-cols-2 gap-4">
            <Field label="일자" htmlFor="occurred_date">
              <Input
                id="occurred_date"
                name="occurred_date"
                type="date"
                defaultValue={todayLocal()}
              />
            </Field>
            <Field label="유형">
              <Select name="type" defaultValue="미팅">
                <SelectTrigger>
                  <SelectValue placeholder="선택" />
                </SelectTrigger>
                <SelectContent>
                  {ACTIVITY_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>

          <Field label="내용" htmlFor="content" required>
            <Textarea
              id="content"
              name="content"
              required
              rows={4}
              placeholder="예: A조합(2021 vintage) 잔여재원 200억, 구주 적극 검토. 만기 2026.12."
            />
          </Field>

          {state && !state.ok && (
            <p className="text-sm text-destructive" role="alert">
              {state.error}
            </p>
          )}
          {state?.ok && (
            <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/30 p-3 text-sm">
              <CheckCircle2 className="size-4 text-primary" />
              <span>미팅을 기록했습니다.</span>
              <Button asChild size="sm" variant="outline" className="ml-auto">
                <Link href={`/investors/${state.investorId}`}>투자사 보기</Link>
              </Button>
            </div>
          )}

          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                {state?.ok ? "닫기" : "취소"}
              </Button>
            </DialogClose>
            <Button type="submit" disabled={pending}>
              {pending ? "기록 중…" : "기록"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
