"use client";

import { useState, type ReactNode } from "react";
import { EyeOff, FileCheck, FileX } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

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

  // 카운트는 "가리기" 상태에 맞춰 바꿔 보여준다(제출/미제출 토글은 표만 걸러 카운트 유지).
  const s = summary && (hideExited ? summary.live : summary.all);
  const view = [
    only === "submitted" && "only-submitted",
    only === "unsubmitted" && "only-unsubmitted",
    hideExited && "hide-exited",
  ]
    .filter(Boolean)
    .join(" ");

  const toggle = (next: "submitted" | "unsubmitted") =>
    setOnly((cur) => (cur === next ? null : next));

  return (
    <div className="space-y-6" data-fin-view={view || undefined}>
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
