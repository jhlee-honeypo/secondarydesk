import { Card, CardContent } from "@/components/ui/card";
import { formatThousandWon, formatWon } from "@/lib/format";
import type { ScenarioTotals } from "@/lib/exit-scenario";

function Metric({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub: string;
}) {
  return (
    <Card size="sm">
      <CardContent className="space-y-1">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-2xl font-semibold tracking-tight">{value}</p>
        <p className="text-xs text-muted-foreground">{sub}</p>
      </CardContent>
    </Card>
  );
}

export function SummaryCards({
  totals,
  roundShares,
}: {
  totals: ScenarioTotals;
  roundShares: number[];
}) {
  const sharesBreakdown =
    roundShares.length > 0
      ? roundShares
          .map((s, i) => `${i + 1}차 ${s.toLocaleString("ko-KR")}`)
          .join(" + ")
      : "—";

  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      <Metric
        label="총 투자원금"
        value={formatThousandWon(totals.totalPrincipal)}
        sub={`${roundShares.length || 0}개 라운드 합산`}
      />
      <Metric
        label="현재 예상가치"
        value={formatThousandWon(totals.currentValue)}
        sub={`최종 단가 × ${totals.totalShares.toLocaleString("ko-KR")}주`}
      />
      <Metric
        label="총 보유 주식수"
        value={`${totals.totalShares.toLocaleString("ko-KR")}주`}
        sub={sharesBreakdown}
      />
      <Metric
        label="손익분기 단가"
        value={formatWon(totals.breakevenPrice)}
        sub={`원/주 (≈ ${(totals.breakevenDiscount * 100).toFixed(1)}% 할인)`}
      />
    </div>
  );
}
