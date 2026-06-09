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
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import type { Contact } from "@/lib/types";
import { Field } from "@/components/app/field";
import { createContact, updateContact, type ActionResult } from "../actions";

export function ContactFormDialog({
  trigger,
  investorId,
  contact,
}: {
  trigger: React.ReactNode;
  investorId: string;
  contact?: Contact;
}) {
  const isEdit = Boolean(contact);
  const [state, formAction, pending] = useActionState<
    ActionResult | undefined,
    FormData
  >(isEdit ? updateContact : createContact, undefined);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (state?.ok) setOpen(false);
  }, [state]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[90svh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "컨택 수정" : "새 컨택 등록"}</DialogTitle>
          <DialogDescription>
            투자사 내 담당자(의사결정자/심사역) 정보를 입력합니다.
          </DialogDescription>
        </DialogHeader>

        <form action={formAction} className="space-y-4">
          <input type="hidden" name="investor_id" value={investorId} />
          {isEdit && <input type="hidden" name="id" value={contact!.id} />}

          <div className="grid grid-cols-2 gap-4">
            <Field label="이름" htmlFor="contact-name" required>
              <Input
                id="contact-name"
                name="name"
                defaultValue={contact?.name ?? ""}
                required
              />
            </Field>
            <Field label="직책" htmlFor="title">
              <Input
                id="title"
                name="title"
                placeholder="상무 / 심사역 등"
                defaultValue={contact?.title ?? ""}
              />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Field label="이메일" htmlFor="email">
              <Input
                id="email"
                name="email"
                type="email"
                defaultValue={contact?.email ?? ""}
              />
            </Field>
            <Field label="전화" htmlFor="phone">
              <Input
                id="phone"
                name="phone"
                defaultValue={contact?.phone ?? ""}
              />
            </Field>
          </div>

          <div className="flex items-center gap-2">
            <Checkbox
              id="is_decision_maker"
              name="is_decision_maker"
              defaultChecked={contact?.is_decision_maker ?? false}
            />
            <Label htmlFor="is_decision_maker" className="font-normal">
              의사결정권자
            </Label>
          </div>

          <Field label="메모" htmlFor="contact-notes">
            <Textarea
              id="contact-notes"
              name="notes"
              defaultValue={contact?.notes ?? ""}
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
