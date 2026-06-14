import Link from "next/link";

import { loadAnalytics } from "@/lib/analytics";
import { formatKRW } from "@/lib/format";
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

  const a = await loadAnalytics({ periodDays, fundId: fund || null });

  const maxFunnel = Math.max(1, ...a.funnel.map((f) => f.count));
  const coverageLabel = fund ? "노출 매물 / 조합 기업" : "노출 매물 / 전체 매물";

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">대시보드</h1>
          <p className="text-sm text-muted-foreground">
            파이프라인 현황과 매물·투자사 진척을 한눈에 봅니다.
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
        <Metric label="컨택 투자사" value={`${a.contactedInvestorCount}곳`} />
        <Metric
          label={coverageLabel}
          value={`${a.exposedListingCount} / ${a.totalListingCount}`}
        />
        <Metric label="클로징" value={`${a.closedCount}건`} />
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

        {/* 정체 딜 — 비종료 단계에서 오래 멈춘 딜(팔로업 필요) */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              정체 딜{" "}
              <span className="text-sm font-normal text-muted-foreground">
                {STALE_LABEL}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {a.staleDeals.length === 0 ? (
              <p className="px-4 pb-4 text-sm text-muted-foreground">
                {STALE_LABEL} 멈춘 딜이 없습니다.
              </p>
            ) : (
              <div className="border-t border-border">
                {a.staleDeals.map((s) => (
                  <Link
                    key={s.id}
                    href="/deals"
                    className="flex items-center justify-between gap-3 border-b border-border px-4 py-2.5 last:border-0 hover:bg-muted/40"
                  >
                    <span className="min-w-0 truncate text-sm">
                      <span className="font-medium">{s.listingName}</span>{" "}
                      <span className="text-muted-foreground">
                        · {s.investorName}
                      </span>
                    </span>
                    <span className="flex shrink-0 items-center gap-2 text-xs">
                      <Badge variant={DEAL_STAGE_VARIANT[s.stage]}>
                        {s.stage}
                      </Badge>
                      <span className="font-medium text-muted-foreground tabular-nums">
                        {s.days}일째
                      </span>
                    </span>
                  </Link>
                ))}
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

      {/* 투자사별 진척 */}
      <Card className="p-0">
        <div className="flex items-center justify-between px-4 pt-4">
          <h2 className="text-base font-medium">투자사별 진척</h2>
        </div>
        {a.investorProgress.length === 0 ? (
          <p className="px-4 py-6 text-sm text-muted-foreground">
            집계할 딜이 없습니다.
          </p>
        ) : (
          <table className="mt-2 w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th className="px-4 py-2.5 font-medium">투자사</th>
                <th className="px-4 py-2.5 font-medium">컨택 매물 수</th>
                <th className="px-4 py-2.5 font-medium">최고 도달 단계</th>
              </tr>
            </thead>
            <tbody>
              {a.investorProgress.map((row) => (
                <tr
                  key={row.id}
                  className="border-b border-border last:border-0 hover:bg-muted/40"
                >
                  <td className="px-4 py-3">
                    <Link
                      href={`/investors/${row.id}`}
                      className="font-medium text-foreground hover:text-primary hover:underline"
                    >
                      {row.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {row.listingCount}건
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

const STALE_LABEL = "30일 이상 미진척";

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
