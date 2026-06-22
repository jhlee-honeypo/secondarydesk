"use client";

import { useState, useTransition } from "react";

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

/**
 * 삭제 확인 모달. `action` 은 id 가 바인딩된 서버 액션.
 * `confirmText` 가 주어지면(연쇄 삭제 등 위험한 작업) 그 문구를 정확히
 * 입력해야 삭제 버튼이 활성화된다 — 공동작업 시 실수 삭제 방지.
 */
export function DeleteDialog({
  trigger,
  title,
  description,
  action,
  confirmText,
}: {
  trigger: React.ReactNode;
  title: string;
  description: string;
  action: () => Promise<void>;
  confirmText?: string;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [typed, setTyped] = useState("");

  const confirmed = !confirmText || typed.trim() === confirmText;

  function handleDelete() {
    if (pending || !confirmed) return;
    startTransition(async () => {
      await action();
      setOpen(false);
      setTyped("");
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent
        className="max-w-md"
        // Enter = 삭제(확인). 기본 포커스가 '취소'라 Enter 시 닫히던 동작을 덮는다.
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            handleDelete();
          }
        }}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {confirmText && (
          <div className="space-y-1.5">
            <p className="text-sm text-muted-foreground">
              확인을 위해 <span className="font-medium text-foreground">{confirmText}</span>{" "}
              을(를) 입력하세요.
            </p>
            <Input
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder={confirmText}
              autoFocus
            />
          </div>
        )}
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="outline">
              취소
            </Button>
          </DialogClose>
          <Button
            type="button"
            variant="destructive"
            disabled={pending || !confirmed}
            onClick={handleDelete}
          >
            {pending ? "삭제 중…" : "삭제"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
