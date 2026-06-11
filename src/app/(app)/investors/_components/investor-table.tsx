"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";

import type { InvestorWithOwner } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

export function InvestorTable({ rows }: { rows: InvestorWithOwner[] }) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((inv) =>
      [inv.name, inv.type, inv.owner?.name, inv.owner?.email]
        .filter(Boolean)
        .some((v) => (v as string).toLowerCase().includes(q)),
    );
  }, [rows, query]);

  return (
    <div className="space-y-3">
      <div className="relative max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="투자사명·유형·담당으로 검색…"
          className="pl-9"
        />
      </div>

      <Card className="p-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs text-muted-foreground">
              <th className="px-4 py-2.5 font-medium">투자사명</th>
              <th className="px-4 py-2.5 font-medium">유형</th>
              <th className="px-4 py-2.5 font-medium">담당</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td
                  colSpan={3}
                  className="px-4 py-10 text-center text-sm text-muted-foreground"
                >
                  “{query}”에 해당하는 투자사가 없습니다.
                </td>
              </tr>
            ) : (
              filtered.map((inv) => (
                <tr
                  key={inv.id}
                  className="border-b border-border last:border-0 hover:bg-muted/40"
                >
                  <td className="px-4 py-3">
                    <Link
                      href={`/investors/${inv.id}`}
                      className="font-medium text-foreground hover:text-primary hover:underline"
                    >
                      {inv.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    {inv.type ? (
                      <Badge variant="outline">{inv.type}</Badge>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {inv.owner?.name ?? inv.owner?.email ?? "—"}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
