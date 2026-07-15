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
import { formatDate } from "@/lib/format";
import type { CorporateRegistration } from "@/lib/types";

export type RegistrationRow = {
  companyId: string;
  companyName: string;
  companyNameEn: string | null;
  fundIds: string[]; // 소속 운용펀드 id
  reg: CorporateRegistration | null;
};

// slab CDN 원본 PDF를 same-origin·inline 으로 여는 프록시(financials 와 동일 경로 재사용)
function pdfHref(url: string): string {
  return `/api/financial-file?url=${encodeURIComponent(url)}`;
}

const fmtShares = (n: number | null): string =>
  n === null || n === undefined ? "—" : n.toLocaleString("ko-KR");

export function RegistrationsTable({
  rows,
  fundOptions,
}: {
  rows: RegistrationRow[];
  fundOptions: ComboOption[];
}) {
  const [q, setQ] = useState("");
  const [fund, setFund] = useState("");
  const [onlyReg, setOnlyReg] = useState(false);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (fund && !r.fundIds.includes(fund)) return false;
      if (onlyReg && !r.reg) return false;
      if (!term) return true;
      return [
        r.companyName,
        r.companyNameEn,
        r.reg?.head_office_address,
        r.reg?.head_office_city,
      ]
        .filter(Boolean)
        .some((v) => v!.toLowerCase().includes(term));
    });
  }, [q, fund, onlyReg, rows]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="회사명·소재지로 검색"
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
            checked={onlyReg}
            onChange={(e) => setOnlyReg(e.target.checked)}
            className="size-3.5"
          />
          등기 있는 곳만
        </label>
        <span className="text-sm text-muted-foreground">
          {filtered.length}
          {filtered.length !== rows.length && ` / ${rows.length}`}곳
        </span>
      </div>

      <Card className="overflow-x-auto p-0">
        <table className="w-full table-fixed text-sm">
          <colgroup>
            <col className="w-[18%]" />
            <col className="w-[9%]" />
            <col className="w-[34%]" />
            <col className="w-[11%]" />
            <col className="w-[13%]" />
            <col className="w-[9%]" />
            <col className="w-[6%]" />
          </colgroup>
          <thead className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2">회사</th>
              <th className="px-3 py-2">설립일</th>
              <th className="px-3 py-2">본점 소재지</th>
              <th className="px-3 py-2 text-right">발행주식총수</th>
              <th className="px-3 py-2">종류별 주식</th>
              <th className="px-3 py-2">등기 발행일</th>
              <th className="px-3 py-2">원본</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => {
              const reg = r.reg;
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

              if (!reg) {
                // 등기 미첨부 — 회색 빈 행
                return (
                  <tr
                    key={r.companyId}
                    className="border-b align-top text-muted-foreground/60 last:border-0"
                  >
                    {nameCell}
                    <td className="px-3 py-2" colSpan={5}>
                      <Badge variant="outline" className="text-[10px]">
                        정보 없음
                      </Badge>
                    </td>
                    <td className="px-3 py-2">—</td>
                  </tr>
                );
              }

              return (
                <tr key={r.companyId} className="border-b align-top last:border-0">
                  {nameCell}
                  <td className="px-3 py-2 whitespace-nowrap">
                    {formatDate(reg.established_date)}
                  </td>
                  <td className="px-3 py-2">
                    {reg.head_office_city && (
                      <Badge variant="outline" className="mb-1 text-[10px]">
                        {reg.head_office_city}
                      </Badge>
                    )}
                    <span className="block text-muted-foreground">
                      {reg.head_office_address ?? "—"}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">
                    {fmtShares(reg.total_issued_shares)}
                  </td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">
                    {reg.shares_by_type.length > 0
                      ? reg.shares_by_type.map((s, i) => (
                          <span key={i} className="block whitespace-nowrap">
                            {s.type} {fmtShares(s.count)}
                          </span>
                        ))
                      : "—"}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">
                    {formatDate(reg.issue_date)}
                  </td>
                  <td className="px-3 py-2">
                    {reg.source_file_url ? (
                      <a
                        href={pdfHref(reg.source_file_url)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 whitespace-nowrap text-primary underline"
                        title={reg.source_file ?? "등기부등본 원본"}
                      >
                        <FileText className="size-3.5" />
                        등본
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
