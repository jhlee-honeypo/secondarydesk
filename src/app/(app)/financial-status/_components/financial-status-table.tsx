"use client";

import { Fragment, useMemo, useState, useTransition } from "react";
import { ChevronRight, Download, FileText, Loader2 } from "lucide-react";

import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  SearchableSelect,
  type ComboOption,
} from "@/components/app/searchable-select";
import { formatWon } from "@/lib/format";
import {
  computeMetrics,
  gradeHealth,
  isBalanceConsistent,
  quarterIndex,
  HEALTH_LABEL,
  type HealthLevel,
} from "@/lib/financial-health";
import type { FinancialStatement } from "@/lib/types";
import { listFinancialHistory } from "@/app/(app)/financials/history-actions";
import { exportFinancialCsv } from "../export-actions";
import { RAW_COLS, RAW_GROUPS, type RawCol } from "./raw-columns";

export type FinStatusRow = {
  companyId: string;
  companyName: string;
  companyNameEn: string | null;
  fundIds: string[]; // 소속 운용펀드 id
  latest: FinancialStatement | null; // 회사별 최신 분기 재무행
  quarterCount: number; // 추출된 분기 수
};

const HEALTH_VARIANT: Record<HealthLevel, "destructive" | "secondary" | "outline"> = {
  danger: "destructive",
  warning: "secondary",
  good: "outline",
};

// 머리글 첫 줄(그룹). 아래 본문 열 순서와 개수가 정확히 맞아야 한다:
// 회사(1) · 기준(2) · RAW_GROUPS · 점검(3).
const HEAD_GROUPS = [
  { label: "", span: 2 }, // 분기, 통화 (회사 열은 sticky 라 따로 그린다)
  ...RAW_GROUPS.map((g) => ({ label: g.label, span: g.cols.length })),
  { label: "추출 점검", span: 3 }, // 건전성, 정합, 원본
];

const TOTAL_COLS = 3 + RAW_COLS.length + 3;

// slab CDN 원본 PDF를 same-origin·inline 으로 여는 프록시(등기·재무점검과 동일 경로).
// source_file_url 은 여러 URL 이 줄바꿈으로 이어질 수 있어 첫 http URL 만 연다.
function firstPdfHref(url: string | null): string | null {
  if (!url) return null;
  const first = url.split("\n").find((u) => /^https?:/i.test(u.trim()));
  return first ? `/api/financial-file?url=${encodeURIComponent(first.trim())}` : null;
}

// 값이 없는 것(null)과 0 은 다르다 — 0 은 "문서에 0 으로 적혀 있거나 해당 항목이
// 없는 것", null 은 "아직 그 항목을 추출하지 않은 행". 그래서 null 만 — 로 찍는다.
function cellText(col: RawCol, f: FinancialStatement): string {
  const v = col.get(f);
  if (v === null || v === undefined || v === "") return "—";
  if (col.kind === "money") return formatWon(v as number);
  if (col.kind === "int") return (v as number).toLocaleString("ko-KR");
  return String(v);
}

// 기준 분기가 '지금 확보된 가장 최신 분기'인지에 따라 색을 나눈다.
// 기준선은 달력이 아니라 데이터의 최댓값이다 — 분기보고는 마감 후 몇 주에 걸쳐
// 올라오므로, 달력 기준으로 잡으면 아직 아무도 못 낸 분기가 기준이 되어 전부
// '이전'으로 물든다.
const QUARTER_TONE = {
  latest: "bg-blue-100 text-blue-800 dark:bg-blue-500/20 dark:text-blue-200",
  older: "bg-amber-100 text-amber-900 dark:bg-amber-500/20 dark:text-amber-100",
} as const;

/** 한 분기 행의 값 칸들 — 최신 분기 행과 펼친 과거 분기 행이 같은 열을 쓴다. */
function ValueCells({ fin }: { fin: FinancialStatement }) {
  const consistent = isBalanceConsistent(fin);
  const health = gradeHealth(fin, computeMetrics(fin));
  const href = firstPdfHref(fin.source_file_url);

  return (
    <>
      <td className="px-2 py-1.5 text-center text-xs text-muted-foreground">
        {fin.currency}
      </td>
      {RAW_COLS.map((col) => {
        const text = cellText(col, fin);
        if (col.kind === "text") {
          return (
            <td key={col.label} className="px-3 py-1.5">
              <div className="max-w-[22rem] truncate" title={text === "—" ? undefined : text}>
                {text}
              </div>
            </td>
          );
        }
        return (
          <td
            key={col.label}
            className="px-3 py-1.5 text-right tabular-nums whitespace-nowrap"
          >
            {text}
          </td>
        );
      })}
      <td className="px-3 py-1.5">
        <Badge variant={HEALTH_VARIANT[health.level]} title={health.reasons.join(" · ")}>
          {HEALTH_LABEL[health.level]}
        </Badge>
      </td>
      <td className="px-3 py-1.5 text-center">
        {consistent === null ? (
          <span className="text-muted-foreground">—</span>
        ) : consistent ? (
          <span
            className="text-emerald-600 dark:text-emerald-400"
            title="자산총계 = 부채총계 + 자본총계"
          >
            ✓
          </span>
        ) : (
          <span
            className="text-rose-600 dark:text-rose-400"
            title="자산총계 ≠ 부채총계 + 자본총계 — 추출 확인 필요"
          >
            ⚠️
          </span>
        )}
      </td>
      <td className="px-3 py-1.5">
        {href ? (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 whitespace-nowrap text-primary underline"
            title={fin.source_file ?? "재무제표 원본"}
          >
            <FileText className="size-3.5" />
            원본
          </a>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </td>
    </>
  );
}

export function FinancialStatusTable({
  rows,
  fundOptions,
}: {
  rows: FinStatusRow[];
  fundOptions: ComboOption[];
}) {
  const [q, setQ] = useState("");
  const [fund, setFund] = useState("");
  const [onlyFin, setOnlyFin] = useState(false);
  const [onlyMismatch, setOnlyMismatch] = useState(false);
  // 회사별 과거 분기 — 펼칠 때 서버에서 읽어 와 캐시한다. 전 분기를 처음부터
  // 실어 보내면(600행 × 30열) 페이지 페이로드가 1MB 를 넘는다.
  const [history, setHistory] = useState<Record<string, FinancialStatement[]>>({});
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState<string | null>(null);
  const [exporting, startExport] = useTransition();

  // 필터링 '전' 전체에서 최신 분기를 잡는다 — 필터를 걸 때마다 기준선이 움직이면
  // 같은 회사가 조합 필터 유무에 따라 파랑↔앰버로 바뀌어 보인다.
  const latestIdx = useMemo(
    () =>
      rows.reduce((max, r) => (r.latest ? Math.max(max, quarterIndex(r.latest)) : max), 0),
    [rows],
  );

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (fund && !r.fundIds.includes(fund)) return false;
      if (onlyFin && !r.latest) return false;
      if (onlyMismatch) {
        if (!r.latest) return false;
        if (isBalanceConsistent(r.latest) !== false) return false;
      }
      if (!term) return true;
      return [r.companyName, r.companyNameEn]
        .filter(Boolean)
        .some((v) => v!.toLowerCase().includes(term));
    });
  }, [q, fund, onlyFin, onlyMismatch, rows]);

  async function toggle(r: FinStatusRow) {
    const next = !open[r.companyId];
    setOpen((s) => ({ ...s, [r.companyId]: next }));
    if (!next || history[r.companyId]) return;
    setLoading(r.companyId);
    const all = await listFinancialHistory(
      r.companyId,
      r.latest?.company_name ?? r.companyName,
    );
    // 최신 분기는 이미 위 줄에 있으므로 과거 분기만 하위 행으로.
    const older = r.latest
      ? all.filter(
          (f) =>
            !(f.report_year === r.latest!.report_year &&
              f.report_month === r.latest!.report_month),
        )
      : all;
    setHistory((s) => ({ ...s, [r.companyId]: older }));
    setLoading((id) => (id === r.companyId ? null : id));
  }

  function download() {
    startExport(async () => {
      const csv = await exportFinancialCsv(
        filtered.map((r) => ({ id: r.companyId, name: r.companyName })),
      );
      const d = new Date();
      const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
      const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = `재무추출_raw_${stamp}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    });
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="회사명으로 검색"
          className="max-w-xs"
        />
        <SearchableSelect
          value={fund}
          onValueChange={setFund}
          options={[{ value: "", label: "전체 조합" }, ...fundOptions]}
          placeholder="조합으로 필터"
          searchPlaceholder="조합 검색"
          ariaLabel="조합"
          triggerClassName="w-56"
        />
        <label className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <input
            type="checkbox"
            checked={onlyFin}
            onChange={(e) => setOnlyFin(e.target.checked)}
            className="size-3.5"
          />
          재무 있는 곳만
        </label>
        <label className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <input
            type="checkbox"
            checked={onlyMismatch}
            onChange={(e) => setOnlyMismatch(e.target.checked)}
            className="size-3.5"
          />
          정합 이상만
        </label>
        <span className="text-sm text-muted-foreground">
          {filtered.length}
          {filtered.length !== rows.length && ` / ${rows.length}`}곳
        </span>

        <div className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
          {/* 기준 분기 색 범례 — 색만 칠하고 뜻을 안 적으면 처음 보는 사람은 못 읽는다. */}
          {latestIdx > 0 && (
            <>
              기준 분기
              <span className={`rounded-full px-2 py-0.5 font-medium ${QUARTER_TONE.latest}`}>
                최신
              </span>
              <span className={`rounded-full px-2 py-0.5 font-medium ${QUARTER_TONE.older}`}>
                이전
              </span>
            </>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={download}
            disabled={exporting || filtered.length === 0}
            title="화면에 걸린 필터 대상 회사의 전 분기 행을 CSV 로 (엑셀용 UTF-8 BOM 포함)"
          >
            {exporting ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Download className="size-3.5" />
            )}
            CSV
          </Button>
        </div>
      </div>

      <Card className="min-h-0 flex-1 overflow-auto p-0">
        {/* w-max = 열 너비 합만큼 늘어나 가로 스크롤이 생긴다(엑셀처럼).
            머리글은 sticky top, 회사 열은 sticky left 로 고정한다. 겹치는
            왼쪽 위 모서리가 가장 위에 와야 하므로 z 를 40 으로 둔다.
            sticky 요소에 걸린 테두리는 border-collapse 표에서 같이 스크롤돼
            사라지므로, 배경은 반투명이 아닌 불투명(bg-muted/bg-background)을 쓴다. */}
        <table className="w-max min-w-full text-sm">
          <thead className="text-left text-xs whitespace-nowrap text-muted-foreground">
            <tr>
              <th
                rowSpan={2}
                className="sticky top-0 left-0 z-40 min-w-[13rem] border-r border-b bg-muted px-3 py-2 align-bottom"
              >
                회사
              </th>
              {HEAD_GROUPS.map((g, i) => (
                <th
                  key={g.label || `g${i}`}
                  colSpan={g.span}
                  // h-[26px] 고정 — 아래 머리글 줄의 sticky top 오프셋이 이 높이에
                  // 맞춰져 있다(다르면 두 줄 사이가 벌어지거나 겹친다).
                  className="sticky top-0 z-20 h-[26px] border-b border-l bg-muted px-3 py-1 text-center text-[10px] font-medium"
                >
                  {g.label}
                </th>
              ))}
            </tr>
            <tr>
              <th className="sticky top-[26px] z-20 border-b border-l bg-muted px-3 py-2">
                분기
              </th>
              <th className="sticky top-[26px] z-20 border-b bg-muted px-2 py-2 text-center">
                통화
              </th>
              {RAW_GROUPS.flatMap((g) =>
                g.cols.map((c, ci) => (
                  <th
                    key={c.label}
                    title={c.title}
                    className={`sticky top-[26px] z-20 border-b bg-muted px-3 py-2 ${
                      ci === 0 ? "border-l" : ""
                    } ${c.kind === "text" ? "text-left" : "text-right"}`}
                  >
                    {c.label}
                  </th>
                )),
              )}
              <th className="sticky top-[26px] z-20 border-b border-l bg-muted px-3 py-2">
                건전성
              </th>
              <th className="sticky top-[26px] z-20 border-b bg-muted px-3 py-2 text-center">
                정합
              </th>
              <th className="sticky top-[26px] z-20 border-b bg-muted px-3 py-2">원본</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => {
              const fin = r.latest;
              const expandable = Boolean(fin) && r.quarterCount > 1;
              const isOpen = Boolean(open[r.companyId]);

              const nameCell = (
                <td
                  className={`sticky left-0 z-10 border-r border-b bg-background px-3 py-1.5 font-medium ${
                    fin ? "" : "text-muted-foreground/60"
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => expandable && toggle(r)}
                    disabled={!expandable}
                    className="flex items-start gap-1 text-left disabled:cursor-default"
                    title={expandable ? `전 분기 ${r.quarterCount}개 펼치기` : undefined}
                  >
                    <ChevronRight
                      className={`mt-0.5 size-3.5 shrink-0 transition-transform ${
                        expandable ? "" : "invisible"
                      } ${isOpen ? "rotate-90" : ""}`}
                    />
                    <span>
                      {r.companyName}
                      {r.companyNameEn && (
                        <span className="block text-xs font-normal text-muted-foreground">
                          {r.companyNameEn}
                        </span>
                      )}
                    </span>
                  </button>
                </td>
              );

              if (!fin) {
                // 재무제표 미추출 — 회색 빈 행
                return (
                  <tr key={r.companyId} className="align-top">
                    {nameCell}
                    <td className="border-b px-3 py-1.5" colSpan={TOTAL_COLS - 1}>
                      <Badge variant="outline" className="text-[10px]">
                        정보 없음
                      </Badge>
                    </td>
                  </tr>
                );
              }

              const behind = latestIdx - quarterIndex(fin);

              return (
                <Fragment key={r.companyId}>
                  <tr className="align-top [&>td]:border-b">
                    {nameCell}
                    <td className="border-l px-3 py-1.5 whitespace-nowrap">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                          behind === 0 ? QUARTER_TONE.latest : QUARTER_TONE.older
                        }`}
                        title={
                          behind === 0
                            ? "최신 분기 자료"
                            : `이전 분기 자료 — 최신보다 ${behind}분기 뒤`
                        }
                      >
                        {fin.report_year} {fin.report_month / 3}분기
                      </span>
                      {r.quarterCount > 1 && (
                        <span className="block pt-0.5 text-[10px] text-muted-foreground">
                          {r.quarterCount}개 분기
                        </span>
                      )}
                    </td>
                    <ValueCells fin={fin} />
                  </tr>

                  {isOpen && loading === r.companyId && (
                    <tr>
                      <td
                        className="sticky left-0 z-10 border-r border-b bg-background px-3 py-1.5"
                        aria-hidden
                      />
                      <td
                        className="border-b px-3 py-1.5 text-xs text-muted-foreground"
                        colSpan={TOTAL_COLS - 1}
                      >
                        불러오는 중…
                      </td>
                    </tr>
                  )}

                  {isOpen &&
                    (history[r.companyId] ?? []).map((h) => (
                      <tr key={h.id} className="align-top bg-muted/30 [&>td]:border-b">
                        {/* 가로 스크롤 시 아래 칸이 비쳐 보이면 안 되므로 고정 열은
                            행 색(반투명)이 아니라 불투명 배경을 쓴다. */}
                        <td
                          className="sticky left-0 z-10 border-r bg-background px-3 py-1.5"
                          aria-hidden
                        />
                        <td className="border-l px-3 py-1.5 whitespace-nowrap text-muted-foreground">
                          <span className="pr-1 text-[10px]">└</span>
                          {h.report_year} {h.report_month / 3}분기
                        </td>
                        <ValueCells fin={h} />
                      </tr>
                    ))}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
