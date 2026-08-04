"use client";

import { useState, useTransition } from "react";
import { Pin } from "lucide-react";

import { cn } from "@/lib/utils";
import { setMeetingTarget } from "../meeting-actions";

/** 미팅 대상 핀 — 재무 요약을 보고 "이 팀은 만나야 한다" 고 표시하는 on/off.
 *  (메모 열의 리마인드 발송 기록과는 다른 값이다.)
 *
 *  data-meeting 속성은 행 강조·"미팅 대상만" 필터가 CSS 로 읽는다
 *  (globals.css 의 tr:has([data-meeting="1"])). 서버 재요청이 없어 즉시 반영된다. */
export function MeetingPin({
  listingId,
  companyName,
  initial,
}: {
  listingId: string;
  companyName: string;
  initial: boolean;
}) {
  const [on, setOn] = useState(initial);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  function toggle() {
    const next = !on;
    setOn(next); // 낙관적 반영 — 실패하면 되돌린다
    setError("");
    startTransition(async () => {
      const r = await setMeetingTarget(listingId, next);
      if (!r.ok) {
        setOn(!next);
        setError(r.error);
      }
    });
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={pending}
      data-meeting={on ? "1" : "0"}
      aria-pressed={on}
      aria-label={`${companyName} 미팅 대상`}
      title={
        error ||
        (on
          ? `${companyName} — 미팅 대상 해제`
          : `${companyName} — 미팅 대상으로 지정`)
      }
      className={cn(
        "inline-flex size-6 items-center justify-center rounded-md transition-colors",
        error && "text-destructive",
        !error && on
          ? "text-amber-600 hover:bg-amber-100 dark:hover:bg-amber-950/50"
          : "text-muted-foreground/40 hover:bg-muted hover:text-foreground",
        pending && "opacity-60",
      )}
    >
      <Pin className={cn("size-4", on && "fill-current")} />
    </button>
  );
}
