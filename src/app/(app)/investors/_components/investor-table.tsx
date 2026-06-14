"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Search, Trash2 } from "lucide-react";

import type { InvestorWithOwner } from "@/lib/types";
import { formatDate } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { DeleteDialog } from "@/components/app/delete-dialog";
import { deleteInvestor } from "../actions";

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
              <th className="px-4 py-2.5 font-medium">등록일</th>
              <th className="w-12 px-4 py-2.5">
                <span className="sr-only">삭제</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td
                  colSpan={5}
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
                  <td className="px-4 py-3 tabular-nums text-muted-foreground">
                    {inv.created_at ? formatDate(inv.created_at) : "—"}
                  </td>
                  <td className="px-2 py-3 text-right">
                    <DeleteDialog
                      trigger={
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`${inv.name} 삭제`}
                        >
                          <Trash2 />
                        </Button>
                      }
                      title="투자사를 삭제할까요?"
                      description={`'${inv.name}'와 소속 조합·컨택·딜·활동이 모두 함께 삭제됩니다. 되돌릴 수 없습니다.`}
                      action={deleteInvestor.bind(null, inv.id)}
                    />
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
