"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";

import { type Fund } from "@/lib/types";
import { formatDate, formatKRW } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { FundDryPowderCell } from "../../investors/_components/fund-dry-powder-cell";

export type AssociationRow = Fund & {
  investor: { id: string; name: string } | null;
};

export function AssociationsTable({
  rows,
  highlightFrom,
  currentYear,
}: {
  rows: AssociationRow[];
  highlightFrom: number;
  currentYear: number;
}) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (f) =>
        f.name.toLowerCase().includes(q) ||
        (f.investor?.name.toLowerCase().includes(q) ?? false),
    );
  }, [rows, query]);

  if (rows.length === 0) {
    return (
      <Card className="items-center justify-center py-16 text-center">
        <p className="text-sm text-muted-foreground">
          아직 등록된 조합이 없습니다. “가져오기”로 DIVA 조합을 적재하세요.
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative w-full max-w-sm">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="조합명 · 투자사 검색…"
            className="pl-9"
            aria-label="조합 검색"
          />
        </div>
        <p className="text-xs text-muted-foreground tabular-nums">
          {query.trim()
            ? `${filtered.length.toLocaleString("ko-KR")} / ${rows.length.toLocaleString("ko-KR")}개`
            : `총 ${rows.length.toLocaleString("ko-KR")}개`}
        </p>
      </div>

      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <span className="inline-block size-2.5 rounded-sm bg-emerald-200 dark:bg-emerald-900" />
        강조 = 최근 3개 연도({highlightFrom}–{currentYear}) 결성 — 미소진 재원이
        남아 있을 수 있음
      </p>

      {filtered.length === 0 ? (
        <Card className="items-center justify-center py-12 text-center">
          <p className="text-sm text-muted-foreground">
            ‘{query.trim()}’에 해당하는 조합이 없습니다.
          </p>
        </Card>
      ) : (
        <Card className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs whitespace-nowrap text-muted-foreground">
                  <th className="px-4 py-2.5 font-medium">투자사</th>
                  <th className="px-4 py-2.5 font-medium">조합명</th>
                  <th className="px-4 py-2.5 font-medium">결성일</th>
                  <th className="px-4 py-2.5 font-medium">만기일</th>
                  <th className="px-4 py-2.5 font-medium">목적구분</th>
                  <th className="px-4 py-2.5 font-medium">투자분야</th>
                  <th className="px-4 py-2.5 text-right font-medium">
                    결성약정총액
                  </th>
                  <th className="px-4 py-2.5 font-medium">드라이파우더 (추정)</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((fund) => {
                  const recent =
                    typeof fund.vintage === "number" &&
                    fund.vintage >= highlightFrom;
                  return (
                    <tr
                      key={fund.id}
                      className={cn(
                        "border-b border-border last:border-0 align-top hover:bg-muted/40",
                        recent &&
                          "bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/30 dark:hover:bg-emerald-950/40",
                      )}
                    >
                      <td className="px-4 py-3">
                        {fund.investor ? (
                          <Link
                            href={`/investors/${fund.investor.id}`}
                            className="font-medium text-foreground hover:text-primary hover:underline"
                          >
                            {fund.investor.name}
                          </Link>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 font-medium">{fund.name}</td>
                      <td className="px-4 py-3 whitespace-nowrap text-muted-foreground tabular-nums">
                        {fund.formation_date
                          ? formatDate(fund.formation_date)
                          : fund.vintage
                            ? `${fund.vintage}년`
                            : "—"}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-muted-foreground tabular-nums">
                        {fund.maturity_date
                          ? formatDate(fund.maturity_date)
                          : "—"}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {fund.main_purpose ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {fund.sector_focus?.length
                          ? fund.sector_focus.join(", ")
                          : "—"}
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap tabular-nums">
                        {fund.aum ? formatKRW(fund.aum) : "—"}
                      </td>
                      <td className="px-4 py-3">
                        <FundDryPowderCell fund={fund} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
