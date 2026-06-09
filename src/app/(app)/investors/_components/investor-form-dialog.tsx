"use client";

import { useActionState, useEffect, useState } from "react";
import { Plus, X } from "lucide-react";

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
import { INVESTOR_TYPES, type Investor, type UserRow } from "@/lib/types";
import { Field } from "@/components/app/field";
import { createInvestor, updateInvestor, type ActionResult } from "../actions";

export function InvestorFormDialog({
  trigger,
  investor,
  users,
  currentUserId,
}: {
  trigger: React.ReactNode;
  investor?: Investor;
  users: UserRow[];
  currentUserId: string;
}) {
  const isEdit = Boolean(investor);
  const [state, formAction, pending] = useActionState<
    ActionResult | undefined,
    FormData
  >(isEdit ? updateInvestor : createInvestor, undefined);
  const [open, setOpen] = useState(false);

  // 조합 입력 행(생성 모드 전용). 최초 1행, '+'로 추가.
  const [fundKeys, setFundKeys] = useState<number[]>([0]);

  useEffect(() => {
    if (state?.ok) setOpen(false);
  }, [state]);

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) setFundKeys([0]); // 닫으면 조합 행 초기화
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? "투자사 정보 수정" : "새 투자사 등록"}
          </DialogTitle>
          <DialogDescription>
            {isEdit
              ? "투자사 기본 정보를 수정합니다."
              : "투자사명만 입력하면 등록됩니다. 컨택 심사역과 조합은 함께 적어둘 수 있습니다."}
          </DialogDescription>
        </DialogHeader>

        <form action={formAction} className="space-y-4">
          {isEdit && <input type="hidden" name="id" value={investor!.id} />}

          <Field label="투자사명" htmlFor="name" required>
            <Input
              id="name"
              name="name"
              defaultValue={investor?.name ?? ""}
              required
            />
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field label="유형">
              <Select name="type" defaultValue={investor?.type ?? undefined}>
                <SelectTrigger>
                  <SelectValue placeholder="선택 (선택사항)" />
                </SelectTrigger>
                <SelectContent>
                  {INVESTOR_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <Field label="담당 심사역">
              <Select
                name="owner_id"
                defaultValue={investor?.owner_id ?? currentUserId}
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

          {/* 컨택 심사역 — 생성 시에만 함께 등록 */}
          {!isEdit && (
            <div className="grid grid-cols-2 gap-4">
              <Field label="컨택 심사역" htmlFor="contact_name">
                <Input
                  id="contact_name"
                  name="contact_name"
                  placeholder="이름"
                />
              </Field>
              <Field label="직책" htmlFor="contact_title">
                <Input
                  id="contact_title"
                  name="contact_title"
                  placeholder="상무 / 심사역 등"
                />
              </Field>
            </div>
          )}

          <Field label="개요·성향 메모" htmlFor="description">
            <Textarea
              id="description"
              name="description"
              defaultValue={investor?.description ?? ""}
            />
          </Field>

          {/* 조합 — 생성 시에만 함께 등록 (행 추가 가능) */}
          {!isEdit && (
            <div className="space-y-3 rounded-lg border border-border p-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">조합 (선택)</p>
                <Button
                  type="button"
                  variant="outline"
                  size="xs"
                  onClick={() =>
                    setFundKeys((keys) => [
                      ...keys,
                      (keys[keys.length - 1] ?? 0) + 1,
                    ])
                  }
                >
                  <Plus />
                  조합 추가
                </Button>
              </div>

              {fundKeys.map((key, idx) => (
                <div
                  key={key}
                  className="space-y-2 rounded-md bg-muted/40 p-2.5"
                >
                  <div className="flex items-center gap-2">
                    <Input
                      name="fund_name"
                      placeholder={`조합명${idx === 0 ? "" : ` ${idx + 1}`}`}
                      aria-label="조합명"
                    />
                    {fundKeys.length > 1 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label="조합 행 삭제"
                        onClick={() =>
                          setFundKeys((keys) => keys.filter((k) => k !== key))
                        }
                      >
                        <X />
                      </Button>
                    )}
                  </div>
                  <Input name="fund_main_purpose" placeholder="주목적" />
                  <Input name="fund_notes" placeholder="비고" />
                </div>
              ))}
            </div>
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
