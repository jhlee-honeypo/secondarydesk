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
import { ACTIVITY_TYPES } from "@/lib/types";
import { Field } from "@/components/app/field";
import { createActivity, type ActionResult } from "../actions";

/** 현재 시각을 datetime-local 입력 형식(YYYY-MM-DDTHH:mm)으로 반환 */
function nowLocal(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function ActivityFormDialog({
  trigger,
  investorId,
  contacts,
  deals,
}: {
  trigger: React.ReactNode;
  investorId: string;
  contacts: { id: string; name: string }[];
  deals: { id: string; label: string }[];
}) {
  const [state, formAction, pending] = useActionState<
    ActionResult | undefined,
    FormData
  >(createActivity, undefined);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (state?.ok) setOpen(false);
  }, [state]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[90svh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>활동 기록</DialogTitle>
          <DialogDescription>
            컨택 이력을 빠르게 남깁니다. 유형·내용만 채워도 저장됩니다.
          </DialogDescription>
        </DialogHeader>

        <form action={formAction} className="space-y-4">
          <input type="hidden" name="investor_id" value={investorId} />

          <div className="grid grid-cols-2 gap-4">
            <Field label="활동 유형" required>
              <Select name="type" required>
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
            <Field label="일시" htmlFor="occurred_at">
              <Input
                id="occurred_at"
                name="occurred_at"
                type="datetime-local"
                defaultValue={nowLocal()}
              />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Field label="대상 컨택">
              <Select name="contact_id" disabled={contacts.length === 0}>
                <SelectTrigger>
                  <SelectValue
                    placeholder={contacts.length ? "선택" : "등록된 컨택 없음"}
                  />
                </SelectTrigger>
                <SelectContent>
                  {contacts.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="연결 딜">
              <Select name="deal_id" disabled={deals.length === 0}>
                <SelectTrigger>
                  <SelectValue
                    placeholder={deals.length ? "선택" : "연결할 딜 없음"}
                  />
                </SelectTrigger>
                <SelectContent>
                  {deals.map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.label}
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
              placeholder="무엇을 했고 어떤 반응이었는지 요약"
            />
          </Field>

          <Field label="첨부 링크" htmlFor="attachment_url">
            <Input
              id="attachment_url"
              name="attachment_url"
              type="url"
              placeholder="https://"
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
