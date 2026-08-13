"use client";

import { useState, useTransition } from "react";

import { cn } from "@/lib/utils";
import {
  LISTING_GROUP_CODES,
  LISTING_GROUP_LABEL,
  type ListingGroupCode,
} from "@/lib/types";
import { setQuarterGroup } from "../group-actions";

// 그룹별 색. 건강도 배지(위험 rose / 주의 amber / 양호 emerald)와 헷갈리지 않게
// 세 색 모두 다른 계열로 잡았다.
// 선택 안 한 버튼은 회색이고, hover 때만 그 그룹 색을 보여준다(칸이 좁아 세 개가
// 동시에 색을 갖고 있으면 어느 게 찍힌 건지 안 보인다).
const TONE: Record<ListingGroupCode, { on: string; off: string; text: string }> = {
  A: {
    on: "bg-emerald-600 text-white",
    off: "hover:bg-emerald-100 hover:text-emerald-700 dark:hover:bg-emerald-950/50 dark:hover:text-emerald-400",
    text: "text-emerald-700 dark:text-emerald-400",
  },
  B: {
    on: "bg-sky-600 text-white",
    off: "hover:bg-sky-100 hover:text-sky-700 dark:hover:bg-sky-950/50 dark:hover:text-sky-400",
    text: "text-sky-700 dark:text-sky-400",
  },
  C: {
    on: "bg-orange-600 text-white",
    off: "hover:bg-orange-100 hover:text-orange-700 dark:hover:bg-orange-950/50 dark:hover:text-orange-400",
    text: "text-orange-700 dark:text-orange-400",
  },
};

/** 분기별 회수 전략 그룹 기입 칸 — A/B/C 세 버튼(선택된 걸 다시 누르면 해제).
 *
 *  기본은 공란(미기입)이고 자동 승계도 없다. 대신 이전 분기에 뭐라고 봤는지를
 *  버튼 아래 회색 줄로 함께 보여줘, 당 분기를 찍을 때 바로 대조할 수 있게 한다.
 *
 *  data-group 속성은 상단 "그룹" 필터가 CSS 로 읽는다(globals.css 의
 *  [data-fin-view~="only-group-A"] …). 서버 재요청이 없어 즉시 반영된다. */
export function QuarterGroupSelect({
  listingId,
  companyName,
  year,
  month,
  initial,
  previous,
  prevLabel,
}: {
  listingId: string;
  companyName: string;
  /** 기입 대상 분기 — 표 머리글의 분기와 같다 */
  year: number;
  month: number;
  initial: ListingGroupCode | null;
  /** 직전 분기에 찍혀 있던 그룹(없으면 null) */
  previous: ListingGroupCode | null;
  prevLabel: string;
}) {
  const [code, setCode] = useState(initial);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  function pick(next: ListingGroupCode) {
    const value = code === next ? null : next; // 같은 걸 다시 누르면 해제
    const before = code;
    setCode(value); // 낙관적 반영 — 실패하면 되돌린다
    setError("");
    startTransition(async () => {
      const r = await setQuarterGroup(listingId, year, month, value);
      if (!r.ok) {
        setCode(before);
        setError(r.error);
      }
    });
  }

  return (
    <div
      data-group={code ?? "none"}
      className={cn("inline-flex flex-col items-center gap-0.5", pending && "opacity-60")}
    >
      <div
        className="inline-flex overflow-hidden rounded-md border"
        role="group"
        aria-label={`${companyName} 회수 전략 그룹`}
      >
        {LISTING_GROUP_CODES.map((g) => {
          const on = code === g;
          return (
            <button
              key={g}
              type="button"
              onClick={() => pick(g)}
              disabled={pending}
              aria-pressed={on}
              title={
                error ||
                `${g} — ${LISTING_GROUP_LABEL[g]}${on ? " (다시 누르면 해제)" : ""}`
              }
              className={cn(
                "size-5 text-[11px] font-semibold transition-colors",
                on ? TONE[g].on : cn("text-muted-foreground/40", TONE[g].off),
              )}
            >
              {g}
            </button>
          );
        })}
      </div>
      {previous && (
        <span
          className="text-[10px] whitespace-nowrap text-muted-foreground"
          title={`${prevLabel} 그룹 — ${LISTING_GROUP_LABEL[previous]}`}
        >
          이전 <b className={TONE[previous].text}>{previous}</b>
        </span>
      )}
      {error && <span className="text-[10px] text-destructive">저장 실패</span>}
    </div>
  );
}
