import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { formatWon } from "@/lib/format";
import type { ProjectionRow } from "@/lib/exit-scenario";

export function ProjectionTable({ rows }: { rows: ProjectionRow[] }) {
  return (
    <Card className="overflow-hidden p-0">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs text-muted-foreground">
            <th className="px-4 py-2.5 font-medium">할인율</th>
            <th className="px-4 py-2.5 text-right font-medium">매각 단가 (원/주)</th>
            <th className="px-4 py-2.5 text-right font-medium">매각 총액 (원)</th>
            <th className="px-4 py-2.5 text-right font-medium">손익 (원)</th>
            <th className="px-4 py-2.5 text-right font-medium">수익률 (MoM)</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr
              key={r.discount}
              className={cn(
                "border-b border-border last:border-0",
                r.isBreakevenNearest && "bg-amber-50 dark:bg-amber-950/30",
              )}
            >
              <td className="px-4 py-3">
                <span className="inline-flex items-center gap-2">
                  <span className="font-medium">
                    {Math.round(r.discount * 100)}%
                  </span>
                  {r.isBreakevenNearest && (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:bg-amber-900/50 dark:text-amber-300">
                      ≈ 손익분기
                    </span>
                  )}
                </span>
              </td>
              <td className="px-4 py-3 text-right tabular-nums">
                {formatWon(r.salePrice)}
              </td>
              <td className="px-4 py-3 text-right tabular-nums">
                {formatWon(r.saleTotal)}
              </td>
              <td className="px-4 py-3 text-right">
                <span className="inline-flex items-center justify-end gap-2">
                  <span
                    className={cn(
                      "tabular-nums font-medium",
                      r.isProfit
                        ? "text-emerald-600 dark:text-emerald-400"
                        : "text-destructive",
                    )}
                  >
                    {r.pnl > 0 ? "+" : ""}
                    {formatWon(r.pnl)}
                  </span>
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 text-[11px] font-medium",
                      r.isProfit
                        ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
                        : "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
                    )}
                  >
                    {r.isProfit ? "이익" : "손실"}
                  </span>
                </span>
              </td>
              <td
                className={cn(
                  "px-4 py-3 text-right tabular-nums",
                  r.mom > 1 && "text-emerald-600 dark:text-emerald-400",
                  r.mom < 1 && "text-destructive",
                )}
              >
                {r.mom.toFixed(2)}x
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}
