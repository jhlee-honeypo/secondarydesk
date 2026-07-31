"use client";

import { useMemo, useState } from "react";
import { FileText } from "lucide-react";

import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
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

// slab CDN 원본 PDF를 same-origin·inline 으로 여는 프록시(등기·재무점검과 동일 경로).
// source_file_url 은 여러 URL 이 줄바꿈으로 이어질 수 있어 첫 http URL 만 연다.
function firstPdfHref(url: string | null): string | null {
  if (!url) return null;
  const first = url.split("\n").find((u) => /^https?:/i.test(u.trim()));
  return first ? `/api/financial-file?url=${encodeURIComponent(first.trim())}` : null;
}

function pctOrDash(v: number | null): string {
  return v === null ? "—" : `${(v * 100).toFixed(0)}%`;
}

// 기준 분기가 '지금 확보된 가장 최신 분기'인지에 따라 색을 나눈다.
// 기준선은 달력이 아니라 데이터의 최댓값이다 — 분기보고는 마감 후 몇 주에 걸쳐
// 올라오므로, 달력 기준으로 잡으면 아직 아무도 못 낸 분기가 기준이 되어 전부
// '이전'으로 물든다.
// 파랑=최신, 앰버=이전. 같은 표의 '자본잠식' 앰버 텍스트와 헷갈리지 않도록
// 여기는 채운 알약(pill)으로 쓴다(색만이 아니라 형태로도 구분).
const QUARTER_TONE = {
  latest:
    "bg-blue-100 text-blue-800 dark:bg-blue-500/20 dark:text-blue-200",
  older:
    "bg-amber-100 text-amber-900 dark:bg-amber-500/20 dark:text-amber-100",
} as const;

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

  // 필터링 '전' 전체에서 최신 분기를 잡는다 — 필터를 걸 때마다 기준선이 움직이면
  // 같은 회사가 조합 필터 유무에 따라 파랑↔앰버로 바뀌어 보인다.
  const latestIdx = useMemo(
    () =>
      rows.reduce(
        (max, r) => (r.latest ? Math.max(max, quarterIndex(r.latest)) : max),
        0,
      ),
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

  return (
    <div className="space-y-3">
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
          triggerClassName="w-64"
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

        {/* 기준 분기 색 범례 — 색만 칠하고 뜻을 안 적으면 처음 보는 사람은 못 읽는다. */}
        {latestIdx > 0 && (
          <span className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
            기준 분기
            <span
              className={`rounded-full px-2 py-0.5 font-medium ${QUARTER_TONE.latest}`}
            >
              최신
            </span>
            <span
              className={`rounded-full px-2 py-0.5 font-medium ${QUARTER_TONE.older}`}
            >
              이전
            </span>
          </span>
        )}
      </div>

      <Card className="overflow-x-auto p-0">
        <table className="w-full table-fixed text-sm">
          <colgroup>
            <col className="w-[18%]" />
            <col className="w-[11%]" />
            <col className="w-[11%]" />
            <col className="w-[11%]" />
            <col className="w-[11%]" />
            <col className="w-[11%]" />
            <col className="w-[9%]" />
            <col className="w-[8%]" />
            <col className="w-[10%]" />
          </colgroup>
          <thead className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2">회사</th>
              <th className="px-3 py-2">기준 분기</th>
              <th className="px-3 py-2 text-right">매출(당기)</th>
              <th className="px-3 py-2 text-right">영업이익</th>
              <th className="px-3 py-2 text-right">당기순이익</th>
              <th className="px-3 py-2 text-right">자본총계</th>
              <th className="px-3 py-2">건전성</th>
              <th className="px-3 py-2">정합</th>
              <th className="px-3 py-2">원본</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => {
              const fin = r.latest;
              const nameCell = (
                <td className="px-3 py-2 font-medium">
                  {r.companyName}
                  {r.companyNameEn && (
                    <span className="block text-xs text-muted-foreground">
                      {r.companyNameEn}
                    </span>
                  )}
                </td>
              );

              if (!fin) {
                // 재무제표 미추출 — 회색 빈 행
                return (
                  <tr
                    key={r.companyId}
                    className="border-b align-top text-muted-foreground/60 last:border-0"
                  >
                    {nameCell}
                    <td className="px-3 py-2" colSpan={7}>
                      <Badge variant="outline" className="text-[10px]">
                        정보 없음
                      </Badge>
                    </td>
                    <td className="px-3 py-2">—</td>
                  </tr>
                );
              }

              const metrics = computeMetrics(fin);
              const health = gradeHealth(fin, metrics);
              const consistent = isBalanceConsistent(fin);
              const href = firstPdfHref(fin.source_file_url);

              return (
                <tr key={r.companyId} className="border-b align-top last:border-0">
                  {nameCell}
                  <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">
                    {(() => {
                      // 색은 2단계(최신/이전)지만, 얼마나 뒤졌는지는 툴팁으로 알린다.
                      const behind = latestIdx - quarterIndex(fin);
                      const isLatest = behind === 0;
                      return (
                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                            isLatest ? QUARTER_TONE.latest : QUARTER_TONE.older
                          }`}
                          title={
                            isLatest
                              ? "최신 분기 자료"
                              : `이전 분기 자료 — 최신보다 ${behind}분기 뒤`
                          }
                        >
                          {fin.report_year} {fin.report_month / 3}분기
                        </span>
                      );
                    })()}
                    {r.quarterCount > 1 && (
                      <span className="block pt-0.5 text-[10px]">
                        {r.quarterCount}개 분기
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">
                    {formatWon(fin.rev_curr)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">
                    {formatWon(fin.operating_income)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">
                    {formatWon(fin.ni_curr)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">
                    {formatWon(fin.total_equity)}
                    {metrics.capitalErosion !== null && metrics.capitalErosion > 0 && (
                      <span className="block text-[10px] text-amber-600 dark:text-amber-400">
                        잠식 {pctOrDash(metrics.capitalErosion)}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <Badge variant={HEALTH_VARIANT[health.level]}>
                      {HEALTH_LABEL[health.level]}
                    </Badge>
                  </td>
                  <td className="px-3 py-2">
                    {consistent === null ? (
                      <span className="text-muted-foreground">—</span>
                    ) : consistent ? (
                      <span className="text-emerald-600 dark:text-emerald-400" title="자산총계 = 부채총계 + 자본총계">
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
                  <td className="px-3 py-2">
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
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
