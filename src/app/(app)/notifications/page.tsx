import Link from "next/link";
import { CalendarClock, Clock, UserX } from "lucide-react";

import { loadNotifications } from "@/lib/notifications";
import { formatDate, fundLabel } from "@/lib/format";
import { DEAL_STAGE_VARIANT } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";

export const dynamic = "force-dynamic";

export default async function NotificationsPage() {
  const { todayStr, actionDeals, holdingFunds, funds, staleContacts } =
    await loadNotifications();

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">알림</h1>
        <p className="text-sm text-muted-foreground">
          오늘 챙겨야 할 액션과 임박한 리마인더입니다.
        </p>
      </div>

      {/* 액션 필요 딜 */}
      <section className="space-y-2">
        <h2 className="flex items-center gap-2 text-sm font-medium">
          <Clock className="size-4 text-muted-foreground" />
          액션 필요 딜
          <span className="text-muted-foreground">({actionDeals.length})</span>
        </h2>
        {actionDeals.length === 0 ? (
          <EmptyCard text="예정일이 임박했거나 지난 딜이 없습니다." />
        ) : (
          <Card className="p-0">
            {actionDeals.map((deal) => {
              const overdue =
                !!deal.next_action_date && deal.next_action_date < todayStr;
              return (
                <Link
                  key={deal.id}
                  href="/deals"
                  className="flex items-center justify-between gap-3 border-b border-border px-4 py-3 last:border-0 hover:bg-muted/40"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {deal.listing?.company_name ?? "—"} ·{" "}
                      <span className="text-muted-foreground">
                        {deal.investor?.name ?? "—"}
                      </span>
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {deal.next_action ?? "다음 액션 미정"}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Badge variant={DEAL_STAGE_VARIANT[deal.stage]}>
                      {deal.stage}
                    </Badge>
                    <span
                      className={
                        overdue
                          ? "text-xs font-medium text-destructive"
                          : "text-xs text-muted-foreground"
                      }
                    >
                      {overdue && "● "}
                      {formatDate(deal.next_action_date)}
                    </span>
                  </div>
                </Link>
              );
            })}
          </Card>
        )}
      </section>

      {/* 운용펀드 만기 임박 */}
      <section className="space-y-2">
        <h2 className="flex items-center gap-2 text-sm font-medium">
          <CalendarClock className="size-4 text-muted-foreground" />
          운용펀드 만기 임박 (90일 내)
          <span className="text-muted-foreground">({holdingFunds.length})</span>
        </h2>
        {holdingFunds.length === 0 ? (
          <EmptyCard text="90일 내 만기 예정인 운용펀드가 없습니다." />
        ) : (
          <Card className="p-0">
            {holdingFunds.map((f) => (
              <Link
                key={f.id}
                href="/listings/funds"
                className="flex items-center justify-between gap-3 border-b border-border px-4 py-3 last:border-0 hover:bg-muted/40"
              >
                <span className="text-sm font-medium" title={f.name}>
                  {fundLabel(f)}
                </span>
                <span className="text-xs text-muted-foreground">
                  만기 {formatDate(f.maturity_date)}
                </span>
              </Link>
            ))}
          </Card>
        )}
      </section>

      {/* 조합(매수 측) 만기 임박 */}
      <section className="space-y-2">
        <h2 className="flex items-center gap-2 text-sm font-medium">
          <CalendarClock className="size-4 text-muted-foreground" />
          투자사 조합 만기 임박 (90일 내)
          <span className="text-muted-foreground">({funds.length})</span>
        </h2>
        {funds.length === 0 ? (
          <EmptyCard text="90일 내 만기 예정인 조합이 없습니다." />
        ) : (
          <Card className="p-0">
            {funds.map((f) => (
              <Link
                key={f.id}
                href={f.investor ? `/investors/${f.investor.id}` : "#"}
                className="flex items-center justify-between gap-3 border-b border-border px-4 py-3 last:border-0 hover:bg-muted/40"
              >
                <span className="text-sm">
                  <span className="font-medium">{f.name}</span>{" "}
                  <span className="text-muted-foreground">
                    · {f.investor?.name ?? "—"}
                  </span>
                </span>
                <span className="text-xs text-muted-foreground">
                  만기 {formatDate(f.maturity_date)}
                </span>
              </Link>
            ))}
          </Card>
        )}
      </section>

      {/* 장기 미접촉 컨택 */}
      <section className="space-y-2">
        <h2 className="flex items-center gap-2 text-sm font-medium">
          <UserX className="size-4 text-muted-foreground" />
          장기 미접촉 (60일+)
          <span className="text-muted-foreground">({staleContacts.length})</span>
        </h2>
        {staleContacts.length === 0 ? (
          <EmptyCard text="60일 이상 미접촉 컨택이 없습니다." />
        ) : (
          <Card className="p-0">
            {staleContacts.map((c) => (
              <Link
                key={c.id}
                href={c.investor ? `/investors/${c.investor.id}` : "#"}
                className="flex items-center justify-between gap-3 border-b border-border px-4 py-3 last:border-0 hover:bg-muted/40"
              >
                <span className="text-sm">
                  <span className="font-medium">{c.name}</span>{" "}
                  <span className="text-muted-foreground">
                    · {c.investor?.name ?? "—"}
                  </span>
                </span>
                <span className="text-xs text-muted-foreground">
                  최근 {formatDate(c.last_contacted_at)}
                </span>
              </Link>
            ))}
          </Card>
        )}
      </section>
    </div>
  );
}

function EmptyCard({ text }: { text: string }) {
  return (
    <Card className="items-center justify-center py-8 text-center">
      <p className="text-sm text-muted-foreground">{text}</p>
    </Card>
  );
}
