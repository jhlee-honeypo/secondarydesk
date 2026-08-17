"use client";

import { useState, useTransition, type ReactNode } from "react";
import { ExternalLink } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { currencyPrefix, formatDate, formatWon } from "@/lib/format";
import {
  computeMetrics,
  gradeHealth,
  type FinancialMetrics,
} from "@/lib/financial-health";
import { slabQuarterlyUrl } from "@/lib/slab-links";
import type { FinancialStatement } from "@/lib/types";
import { cn } from "@/lib/utils";
import { listFinancialHistory } from "../history-actions";
import { HealthBadge } from "./health-badge";

// slab 투자유치여부 영문 원문 → 한글 (재무 점검 표와 동일)
const FUNDING_LABEL: Record<string, string> = {
  None: "없음",
  Done: "완료",
  Expected: "예정",
  Ongoing: "진행중",
};

const won = (v: number) => formatWon(v);
const pct = (v: number) => `${(v * 100).toFixed(0)}%`;

/** 재무 점검 표와 같은 순서·형식의 수치 열. 각 칸 아래에 이전 분기 대비 증감을 붙인다. */
type NumCol = {
  label: string;
  get: (f: FinancialStatement, m: FinancialMetrics) => number | null;
  fmt: (v: number) => string;
  /** 값이 커지는 게 좋은 지표인지 — 증감 색을 정한다. null 이면 색 없음. */
  better: "up" | "down" | null;
  /** null 일 때 표기(런웨이의 null 은 흑자라 뜻이 있다) */
  nullLabel?: string;
  /** 증감을 %p 로 표기(비율 지표) */
  point?: boolean;
  /** 금액 열 — 원화가 아닌 통화면 앞에 기호를 붙인다(증감 줄은 붙이지 않는다) */
  money?: boolean;
};

const NUM_COLS: NumCol[] = [
  { label: "보유현금", get: (_f, m) => m.heldCash, fmt: won, better: "up", money: true },
  {
    label: "월평균매출",
    get: (_f, m) => m.monthlyRevenue,
    fmt: won,
    better: "up",
    money: true,
  },
  {
    label: "월평균지출",
    get: (_f, m) => m.monthlySga,
    fmt: won,
    better: "down",
    money: true,
  },
  {
    label: "월평균차액",
    get: (_f, m) => (m.monthlyBurn === null ? null : -m.monthlyBurn),
    fmt: won,
    better: "up",
    money: true,
  },
  {
    label: "런웨이",
    get: (_f, m) => m.runwayMonths,
    fmt: (v) => `${v.toFixed(1)}개월`,
    better: "up",
    nullLabel: "흑자/충분",
  },
  {
    label: "자본잠식률",
    get: (_f, m) => m.capitalErosion,
    fmt: pct,
    better: "down",
    point: true,
  },
  {
    label: "매출성장",
    get: (_f, m) => m.revenueGrowth,
    fmt: pct,
    better: "up",
    point: true,
  },
  // 영업이익(영업손실은 음수) — 추출 확장 이전 분기는 null 이라 '—' 로 남는다.
  {
    label: "영업이익",
    get: (f) => f.operating_income,
    fmt: won,
    better: "up",
    money: true,
  },
];

/** 이전(더 오래된) 분기 대비 증감 한 줄. 비교 대상이 없으면 그리지 않는다. */
function Delta({ col, cur, prev }: { col: NumCol; cur: number | null; prev: number | null }) {
  if (cur === null || prev === null) return null;
  const d = cur - prev;
  if (d === 0) return <span className="block text-[10px] text-muted-foreground">—</span>;

  const up = d > 0;
  const good = col.better === null ? null : up === (col.better === "up");
  const text = col.point
    ? `${up ? "+" : ""}${(d * 100).toFixed(0)}%p`
    : `${up ? "+" : ""}${col.fmt(d)}`;

  return (
    <span
      className={cn(
        "block text-[10px]",
        good === null
          ? "text-muted-foreground"
          : good
            ? "text-emerald-600"
            : "text-rose-600",
      )}
    >
      {up ? "▲" : "▼"} {text}
    </span>
  );
}

/** 기업명을 클릭하면 그 회사의 모든 분기를 재무 점검 표와 같은 가로 형식으로 펼친다
 *  (별도 페이지 이동 없이 화면 위 오버레이). 한 줄 = 한 분기, 최신 분기가 위.
 *
 *  이력은 열 때마다 서버에서 읽는다 — 표 초기 렌더에 전 분기 데이터를 실어 보내면
 *  매물 수 × 분기 수만큼 페이로드가 커진다(메모 다이얼로그와 같은 방식). */
export function FinancialHistory({
  companyName,
  companyNameEn,
  bubbleCompanyId,
  financialCompanyName,
  children,
}: {
  companyName: string;
  companyNameEn: string | null;
  bubbleCompanyId: string | null;
  /** 이름 매칭용 회사명(표에 매칭된 재무 행의 이름, 없으면 매물명) */
  financialCompanyName: string | null;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<FinancialStatement[] | null>(null);
  const [pending, startTransition] = useTransition();

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (next && rows === null) {
      startTransition(async () =>
        setRows(await listFinancialHistory(bubbleCompanyId, financialCompanyName)),
      );
    }
  }

  const quarters = (rows ?? []).map((f) => ({ f, m: computeMetrics(f) }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* 클릭 = 분기 이력, hover = 연락처(children 의 HoverCard). 둘이 겹치지 않는다. */}
      <button
        type="button"
        onClick={() => onOpenChange(true)}
        className="cursor-pointer text-left hover:text-primary"
        title={`${companyName} 분기별 재무 보기`}
      >
        {children}
      </button>

      <DialogContent className="max-h-[85vh] w-[95vw] max-w-[95vw] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-baseline gap-2">
            {companyName}
            {companyNameEn && (
              <span className="text-sm font-normal text-muted-foreground">
                {companyNameEn}
              </span>
            )}
            <span className="text-sm font-normal text-muted-foreground">
              분기별 재무 {quarters.length > 0 && `· ${quarters.length}개 분기`}
            </span>
          </DialogTitle>
        </DialogHeader>

        {pending && rows === null ? (
          <p className="py-8 text-center text-sm text-muted-foreground">불러오는 중…</p>
        ) : quarters.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            저장된 재무 자료가 없습니다.
          </p>
        ) : (
          <>
            {/* 화면이 좁으면 가로 스크롤 — 열은 줄바꿈 없이 그대로 유지한다. */}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b bg-muted/40 text-left text-xs whitespace-nowrap text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2">분기</th>
                    <th className="px-3 py-2">상태</th>
                    {NUM_COLS.map((c) => (
                      <th key={c.label} className="px-3 py-2 text-right">
                        {c.label}
                      </th>
                    ))}
                    <th className="px-3 py-2">손익</th>
                    <th className="px-3 py-2">투자유치</th>
                    <th className="px-3 py-2 text-right">직원</th>
                  </tr>
                </thead>
                <tbody>
                  {quarters.map(({ f, m }, i) => {
                    const health = gradeHealth(f, m);
                    // 최신순이라 "이전 분기" 는 한 칸 아래(i + 1)
                    const older = quarters[i + 1];
                    return (
                      <tr key={f.id} className="border-b align-top last:border-0">
                        <td className="px-3 py-2 whitespace-nowrap">
                          {(() => {
                            const url = slabQuarterlyUrl(
                              f.bubble_company_id,
                              f.report_year,
                              f.report_month,
                            );
                            const label = `${f.report_year} · ${f.report_month / 3}분기`;
                            return url ? (
                              <a
                                href={url}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1 font-medium underline decoration-dotted underline-offset-4 hover:text-primary"
                                title="slab 분기보고 원본 화면 열기(새 탭)"
                              >
                                {label}
                                <ExternalLink className="size-3" />
                              </a>
                            ) : (
                              <span className="font-medium">{label}</span>
                            );
                          })()}
                          <span className="block text-[10px] text-muted-foreground">
                            {f.source === "slab" ? "slab" : "업로드"}
                          </span>
                        </td>
                        <td className="px-3 py-2">
                          <HealthBadge
                            level={health.level}
                            reasons={health.reasons}
                            updatedLabel={formatDate(f.updated_at)}
                          />
                        </td>
                        {NUM_COLS.map((c) => {
                          const cur = c.get(f, m);
                          const prev = older ? c.get(older.f, older.m) : null;
                          return (
                            <td
                              key={c.label}
                              className="px-3 py-2 text-right whitespace-nowrap"
                            >
                              {cur === null
                                ? (c.nullLabel ?? "—")
                                : `${c.money ? currencyPrefix(f.currency) : ""}${c.fmt(cur)}`}
                              <Delta col={c} cur={cur} prev={prev} />
                            </td>
                          );
                        })}
                        <td className="px-3 py-2 whitespace-nowrap">
                          {m.isProfit ? (
                            <span className="text-emerald-600">흑자</span>
                          ) : (
                            <span className="text-rose-600">적자</span>
                          )}
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap">
                          {f.funding_round
                            ? (FUNDING_LABEL[f.funding_round] ?? f.funding_round)
                            : "—"}
                          {f.funding_series && (
                            <span className="block text-[10px] text-muted-foreground">
                              {f.funding_series}
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-right whitespace-nowrap">
                          {typeof f.head_count === "number" ? `${f.head_count}명` : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <p className="text-[10px] text-muted-foreground">
              증감은 바로 아래 줄(이전 분기) 대비입니다. 월평균은 누적값 ÷ 보고월이고,
              지출은 판관비 기준(매출원가 제외)이라 런웨이 계산과 같습니다.
              {quarters.length === 1 && " 비교할 이전 분기 자료가 없습니다."}
            </p>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
