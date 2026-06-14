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

/**
 * 삭제 확인 모달. `action` 은 id 가 바인딩된 서버 액션.
 */
export function DeleteDialog({
  trigger,
  title,
  description,
  action,
}: {
  trigger: React.ReactNode;
  title: string;
  description: string;
  action: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function handleDelete() {
    if (pending) return;
    startTransition(async () => {
      await action();
      setOpen(false);
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
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="outline">
              취소
            </Button>
          </DialogClose>
          <Button
            type="button"
            variant="destructive"
            disabled={pending}
            onClick={handleDelete}
          >
            {pending ? "삭제 중…" : "삭제"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
