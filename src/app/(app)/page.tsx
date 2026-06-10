import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { loadAnalytics } from "@/lib/analytics";
import { loadNotifications } from "@/lib/notifications";
import { formatDate, formatKRW } from "@/lib/format";
import { DEAL_STAGE_VARIANT } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DashboardFilters } from "./_components/dashboard-filters";

export const dynamic = "force-dynamic";

export default async function DashboardHome({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; fund?: string }>;
}) {
  const { period = "", fund = "" } = await searchParams;
  const periodDays = period && /^\d+$/.test(period) ? Number(period) : null;

  const [a, notif] = await Promise.all([
    loadAnalytics({ periodDays, fundId: fund || null }),
    loadNotifications(),
  ]);

  const maxFunnel = Math.max(1, ...a.funnel.map((f) => f.count));
  const topActions = notif.actionDeals.slice(0, 5);

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">대시보드</h1>
          <p className="text-sm text-muted-foreground">
            파이프라인 현황과 오늘의 액션을 한눈에 봅니다.
          </p>
        </div>
        <DashboardFilters
          holdingFunds={a.holdingFunds}
          period={period}
          fund={fund}
        />
      </div>

      {/* 핵심 지표 */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Metric label="진행 중 딜" value={`${a.activeDealCount}건`} />
        <Metric label="합산 예상금액" value={formatKRW(a.expectedSum)} />
        <Metric
          label="평균 cycle time"
          value={a.avgCycleDays === null ? "—" : `${a.avgCycleDays}일`}
        />
        <Metric label="이번주 활동" value={`${a.weekActivityCount}건`} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* 파이프라인 펀넬 */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">파이프라인 현황</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2.5">
            {a.funnel.map((f) => (
              <Link
                key={f.stage}
                href="/deals"
                className="block space-y-1 rounded-md p-1 hover:bg-muted/40"
              >
                <div className="flex items-center justify-between text-xs">
                  <span className="flex items-center gap-2">
                    <Badge variant={DEAL_STAGE_VARIANT[f.stage]}>
                      {f.stage}
                    </Badge>
                    <span className="text-muted-foreground">{f.count}건</span>
                  </span>
                  <span className="text-muted-foreground">
                    {formatKRW(f.amount)}
                  </span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary/70"
                    style={{ width: `${(f.count / maxFunnel) * 100}%` }}
                  />
                </div>
              </Link>
            ))}
          </CardContent>
        </Card>

        {/* 오늘의 액션 (F10) */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="text-base">오늘의 액션</CardTitle>
              <Link
                href="/notifications"
                className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
              >
                알림 전체 <ArrowRight className="size-3.5" />
              </Link>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {topActions.length === 0 ? (
              <p className="px-4 pb-4 text-sm text-muted-foreground">
                예정일이 임박했거나 지난 딜이 없습니다.
              </p>
            ) : (
              <div className="border-t border-border">
                {topActions.map((deal) => {
                  const overdue =
                    !!deal.next_action_date &&
                    deal.next_action_date < notif.todayStr;
                  return (
                    <Link
                      key={deal.id}
                      href="/deals"
                      className="flex items-center justify-between gap-3 border-b border-border px-4 py-2.5 last:border-0 hover:bg-muted/40"
                    >
                      <span className="min-w-0 truncate text-sm">
                        <span className="font-medium">
                          {deal.listing?.company_name ?? "—"}
                        </span>{" "}
                        <span className="text-muted-foreground">
                          · {deal.investor?.name ?? "—"}
                        </span>
                      </span>
                      <span
                        className={
                          overdue
                            ? "shrink-0 text-xs font-medium text-destructive"
                            : "shrink-0 text-xs text-muted-foreground"
                        }
                      >
                        {overdue && "● "}
                        {formatDate(deal.next_action_date)}
                      </span>
                    </Link>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* 매물별 진척 */}
      <Card className="p-0">
        <div className="flex items-center justify-between px-4 pt-4">
          <h2 className="text-base font-medium">매물별 진척</h2>
        </div>
        {a.listingProgress.length === 0 ? (
          <p className="px-4 py-6 text-sm text-muted-foreground">
            집계할 딜이 없습니다.
          </p>
        ) : (
          <table className="mt-2 w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th className="px-4 py-2.5 font-medium">매물</th>
                <th className="px-4 py-2.5 font-medium">노출 투자사 수</th>
                <th className="px-4 py-2.5 font-medium">최고 도달 단계</th>
              </tr>
            </thead>
            <tbody>
              {a.listingProgress.map((row) => (
                <tr
                  key={row.id}
                  className="border-b border-border last:border-0 hover:bg-muted/40"
                >
                  <td className="px-4 py-3">
                    <Link
                      href={`/listings/${row.id}`}
                      className="font-medium text-foreground hover:text-primary hover:underline"
                    >
                      {row.company_name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {row.investorCount}곳
                  </td>
                  <td className="px-4 py-3">
                    {row.topStage ? (
                      <Badge variant={DEAL_STAGE_VARIANT[row.topStage]}>
                        {row.topStage}
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      {/* 드랍 분석 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">드랍 분석</CardTitle>
        </CardHeader>
        <CardContent>
          {a.lostReasons.length === 0 ? (
            <p className="text-sm text-muted-foreground">드랍된 딜이 없습니다.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {a.lostReasons.map((r) => (
                <li
                  key={r.reason}
                  className="flex items-center justify-between gap-3"
                >
                  <span className="truncate text-muted-foreground">
                    {r.reason}
                  </span>
                  <span className="font-medium">{r.count}건</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <Card size="sm">
      <CardContent className="space-y-1">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-2xl font-semibold tracking-tight">{value}</p>
      </CardContent>
    </Card>
  );
}
