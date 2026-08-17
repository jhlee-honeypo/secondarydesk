"use client";

import { useState, useTransition } from "react";
import { FileWarning } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { setReviewFlag } from "../review-actions";

/** 추출값 확인 필요 표시 — 재무제표가 잘못 올라와 이 분기 숫자가 틀린 행을 찍어 둔다.
 *  (미팅 핀과 다른 값이다. 핀은 "이 팀을 만나야 한다", 이건 "이 데이터를 고쳐야 한다".)
 *
 *  표시는 표 머리글 분기가 아니라 이 행에 매칭된 재무 행(statementId)에 붙는다 —
 *  화면에 보이는 그 숫자가 틀렸다는 뜻이라 분기가 어긋나면 안 된다.
 *
 *  data-review 속성은 상단 "확인 필요만" 필터가 CSS 로 읽는다
 *  (globals.css 의 [data-fin-view~="only-review"]). 서버 재요청이 없어 즉시 반영된다. */
export function ReviewFlag({
  statementId,
  companyName,
  quarterLabel,
  initial,
}: {
  statementId: string;
  companyName: string;
  /** 표시가 붙는 재무 행의 분기(예: "2026년 1분기") */
  quarterLabel: string;
  /** 이미 표시돼 있으면 그 메모(없으면 null) */
  initial: { note: string | null } | null;
}) {
  const [flag, setFlag] = useState(initial);
  const [note, setNote] = useState(initial?.note ?? "");
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  const on = flag !== null;

  function onOpenChange(next: boolean) {
    setOpen(next);
    setError("");
    if (next) setNote(flag?.note ?? ""); // 취소하고 다시 열면 저장된 메모로 되돌린다
  }

  function save(next: boolean) {
    setError("");
    startTransition(async () => {
      const r = await setReviewFlag(statementId, next, note);
      if (!r.ok) return setError(r.error);
      setFlag(next ? { note: note.trim() || null } : null);
      setOpen(false);
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => onOpenChange(true)}
        data-review={on ? "1" : "0"}
        aria-pressed={on}
        aria-label={`${companyName} 추출값 확인 필요`}
        title={
          on
            ? `확인 필요 — ${flag?.note || "메모 없음"} (${quarterLabel})`
            : `${companyName} ${quarterLabel} — 추출값 확인 필요로 표시`
        }
        className={cn(
          "inline-flex size-6 items-center justify-center rounded-md transition-colors",
          on
            ? "text-violet-600 hover:bg-violet-100 dark:text-violet-400 dark:hover:bg-violet-950/50"
            : "text-muted-foreground/40 hover:bg-muted hover:text-foreground",
        )}
      >
        <FileWarning className={cn("size-4", on && "fill-current stroke-background")} />
      </button>

      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="w-[30rem] max-w-[95vw]">
          <DialogHeader>
            <DialogTitle>
              {companyName} — {quarterLabel} 추출값 확인
            </DialogTitle>
          </DialogHeader>

          <p className="text-xs text-muted-foreground">
            재무제표가 잘못 올라와 추출값이 틀린 경우 표시해 두세요. 상단{" "}
            <b>확인 필요만</b> 필터로 모아 보며 <b>원본 대조</b>에서 값을 고칠 수
            있습니다.
          </p>
          <Input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="예: 다른 회사 재무제표 업로드 / 현금·예금만 오류 (선택)"
            maxLength={300}
            onKeyDown={(e) => {
              if (e.key === "Enter") save(true);
            }}
          />
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-rose-500">{error}</span>
            <div className="flex gap-2">
              {on && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => save(false)}
                  disabled={pending}
                >
                  표시 해제
                </Button>
              )}
              <Button size="sm" onClick={() => save(true)} disabled={pending}>
                {pending ? "처리 중…" : on ? "메모 저장" : "확인 필요로 표시"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
