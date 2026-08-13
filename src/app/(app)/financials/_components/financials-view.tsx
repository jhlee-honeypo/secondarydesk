"use client";

import { useState, type ReactNode } from "react";
import { EyeOff, FileCheck, FileX, Pin } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  LISTING_GROUP_CODES,
  LISTING_GROUP_LABEL,
  LISTING_GROUP_SHORT,
  type ListingGroupCode,
} from "@/lib/types";

// 그룹 필터 버튼의 선택 색 — quarter-group-select.tsx 의 버튼 색과 맞춘다.
const GROUP_ON: Record<ListingGroupCode, string> = {
  A: "border-emerald-600 bg-emerald-600 text-white",
  B: "border-sky-600 bg-sky-600 text-white",
  C: "border-orange-600 bg-orange-600 text-white",
  "-": "border-slate-500 bg-slate-500 text-white",
};
const GROUP_OFF: Record<ListingGroupCode, string> = {
  A: "text-emerald-700 dark:text-emerald-400",
  B: "text-sky-700 dark:text-sky-400",
  C: "text-orange-700 dark:text-orange-400",
  "-": "text-slate-600 dark:text-slate-400",
};

// '-' 를 그대로 클래스 이름에 붙이면 only-group-- 가 되어 읽기 어렵다 → na 로 바꾼다
// (globals.css 의 선택자와 맞물린다).
function viewToken(g: ListingGroupCode | "none"): string {
  return g === "-" ? "na" : g;
}

export type FinancialsSummary = {
  submitted: number;
  unsubmitted: number;
  danger: number;
  warning: number;
  good: number;
  none: number;
};

/** 상단 요약 = 필터 버튼. 제출/미제출만 보기 + W/O·EXIT 가리기.
 *
 *  이 페이지는 force-dynamic 이고 slab API 를 조회하므로 URL 파라미터로 필터를 걸면
 *  토글마다 서버 왕복이 생긴다. 그래서 서버가 렌더한 표를 children 으로 받아
 *  data-fin-view + globals.css 로 행만 숨긴다(즉시 반응, 재조회 없음).
 *  숨김 조건은 각 행의 data-sub / data-exited 속성(page.tsx)과 맞물린다. */
export function FinancialsView({
  filters,
  summary,
  children,
}: {
  filters: ReactNode;
  /** 조합 미선택 시 null — 요약/필터 버튼을 감춘다. */
  summary: { all: FinancialsSummary; live: FinancialsSummary } | null;
  children: ReactNode;
}) {
  const [only, setOnly] = useState<"submitted" | "unsubmitted" | null>(null);
  const [hideExited, setHideExited] = useState(false);
  const [onlyMeeting, setOnlyMeeting] = useState(false);
  // 회수 전략 그룹 필터 — "none" 은 아직 기입 안 한 행만 보기.
  const [onlyGroup, setOnlyGroup] = useState<ListingGroupCode | "none" | null>(null);

  // 카운트는 "가리기" 상태에 맞춰 바꿔 보여준다(제출/미제출 토글은 표만 걸러 카운트 유지).
  const s = summary && (hideExited ? summary.live : summary.all);
  const view = [
    only === "submitted" && "only-submitted",
    only === "unsubmitted" && "only-unsubmitted",
    hideExited && "hide-exited",
    onlyMeeting && "only-meeting",
    onlyGroup && `only-group-${viewToken(onlyGroup)}`,
  ]
    .filter(Boolean)
    .join(" ");

  const toggle = (next: "submitted" | "unsubmitted") =>
    setOnly((cur) => (cur === next ? null : next));
  const toggleGroup = (next: ListingGroupCode | "none") =>
    setOnlyGroup((cur) => (cur === next ? null : next));

  return (
    // 표 카드가 남은 높이를 다 쓰고 그 안에서 스크롤되도록 flex 사슬을 잇는다
    // (page.tsx 가 뷰포트 높이로 고정 → 여기 flex-1 → 표 카드 flex-1 + overflow-auto).
    <div
      className="flex min-h-0 flex-1 flex-col gap-6"
      data-fin-view={view || undefined}
    >
      <div className="flex flex-wrap items-center gap-3">
        {filters}
        {s && (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Badge
              asChild
              variant="outline"
              className={cn(
                "cursor-pointer",
                only === "submitted"
                  ? "border-emerald-600 bg-emerald-600 text-white"
                  : "text-emerald-600",
              )}
            >
              <button
                type="button"
                aria-pressed={only === "submitted"}
                onClick={() => toggle("submitted")}
                title="분기보고를 제출한 기업만 보기"
              >
                <FileCheck />
                제출 {s.submitted}
              </button>
            </Badge>
            <Badge
              asChild
              variant="outline"
              className={cn(
                "cursor-pointer",
                only === "unsubmitted"
                  ? "border-rose-500 bg-rose-500 text-white"
                  : "text-rose-500",
              )}
            >
              <button
                type="button"
                aria-pressed={only === "unsubmitted"}
                onClick={() => toggle("unsubmitted")}
                title="분기보고 미제출 기업만 보기"
              >
                <FileX />
                미제출 {s.unsubmitted}
              </button>
            </Badge>

            <Badge
              asChild
              variant="outline"
              className={cn(
                "cursor-pointer",
                hideExited
                  ? "border-foreground bg-foreground text-background"
                  : "text-muted-foreground",
              )}
            >
              <button
                type="button"
                aria-pressed={hideExited}
                onClick={() => setHideExited((v) => !v)}
                title="이 조합에서 EXIT·상각(W/O)한 기업을 목록에서 가린다"
              >
                <EyeOff />
                W/O·EXIT 가리기
              </button>
            </Badge>
            {/* 핀으로 표시한 미팅 대상만 남긴다. 핀은 클라이언트 상태라 개수를
                서버가 알 수 없어 숫자는 붙이지 않는다. */}
            <Badge
              asChild
              variant="outline"
              className={cn(
                "cursor-pointer",
                onlyMeeting
                  ? "border-amber-500 bg-amber-500 text-white"
                  : "text-amber-600",
              )}
            >
              <button
                type="button"
                aria-pressed={onlyMeeting}
                onClick={() => setOnlyMeeting((v) => !v)}
                title="핀으로 지정한 미팅 대상 기업만 보기"
              >
                <Pin />
                미팅 대상만
              </button>
            </Badge>

            {/* 회수 전략 그룹 필터. 그룹은 클라이언트에서 바로 바뀌는 값이라
                (핀과 같은 이유로) 개수는 붙이지 않는다. */}
            <span className="w-2" />
            {LISTING_GROUP_CODES.map((g) => (
              <Badge
                key={g}
                asChild
                variant="outline"
                className={cn(
                  "cursor-pointer",
                  onlyGroup === g ? GROUP_ON[g] : GROUP_OFF[g],
                )}
              >
                <button
                  type="button"
                  aria-pressed={onlyGroup === g}
                  onClick={() => toggleGroup(g)}
                  title={`${g} — ${LISTING_GROUP_LABEL[g]} 만 보기`}
                >
                  {g} {LISTING_GROUP_SHORT[g]}
                </button>
              </Badge>
            ))}
            <Badge
              asChild
              variant="outline"
              className={cn(
                "cursor-pointer",
                onlyGroup === "none"
                  ? "border-foreground bg-foreground text-background"
                  : "text-muted-foreground",
              )}
            >
              <button
                type="button"
                aria-pressed={onlyGroup === "none"}
                onClick={() => toggleGroup("none")}
                title="아직 이 분기 그룹을 기입하지 않은 기업만 보기"
              >
                그룹 미기입
              </button>
            </Badge>

            <span className="w-2" />
            <Badge variant="destructive">위험 {s.danger}</Badge>
            <Badge variant="secondary">주의 {s.warning}</Badge>
            <Badge variant="outline">양호 {s.good}</Badge>
            <Badge variant="outline" className="text-muted-foreground">
              데이터 없음 {s.none}
            </Badge>
          </div>
        )}
      </div>

      {children}
    </div>
  );
}
