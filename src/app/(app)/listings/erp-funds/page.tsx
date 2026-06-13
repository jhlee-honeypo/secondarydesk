import Link from "next/link";
import { ChevronRight, Database } from "lucide-react";

import {
  getErpFundsWithPortfolio,
  type ErpFundWithPortfolio,
} from "@/lib/bubble";
import {
  LISTING_STATUS_VARIANT,
  type ListingStatus,
} from "@/lib/types";
import { formatDate, formatKRW } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { SyncFundsButton } from "./_components/sync-funds-button";

export const dynamic = "force-dynamic";

export default async function ErpFundsPage() {
  let funds: ErpFundWithPortfolio[] = [];
  let loadError = false;
  try {
    funds = await getErpFundsWithPortfolio();
  } catch {
    loadError = true;
  }

  const totalCompanies = funds.reduce((s, f) => s + f.companies.length, 0);

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6">
      <Link
        href="/listings/funds"
        className="text-sm text-muted-foreground hover:text-foreground"
      >
        ← 운용펀드
      </Link>

      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-1">
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <Database className="size-6 text-muted-foreground" />
            ERP 조합 현황
          </h1>
          <p className="text-sm text-muted-foreground">
            sparkERP의 조합 {funds.length}개 · 연결 포트폴리오 {totalCompanies}건
            (읽기 전용). “운용펀드로 가져오기”로 SecondaryDesk 운용펀드에 동기화할 수
            있습니다.
          </p>
        </div>
        <SyncFundsButton />
      </div>

      {loadError ? (
        <Card className="items-center justify-center py-16 text-center">
          <p className="text-sm text-destructive">
            ERP 조합을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.
          </p>
        </Card>
      ) : funds.length === 0 ? (
        <Card className="items-center justify-center py-16 text-center">
          <p className="text-sm text-muted-foreground">
            ERP에서 가져온 조합이 없습니다.
          </p>
        </Card>
      ) : (
        <div className="space-y-3">
          {funds.map((fund) => (
            <Card key={fund.id} className="overflow-hidden p-0">
              <details className="group">
                <summary className="flex cursor-pointer list-none items-center gap-4 px-4 py-3 hover:bg-muted/40">
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-90" />
                  <div className="min-w-0 flex-1">
                    <div className="font-medium">{fund.name}</div>
                    <div className="text-xs text-muted-foreground">
                      결성 {formatDate(fund.startDate)} · 만기{" "}
                      {formatDate(fund.endDate)}
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="font-medium tabular-nums">
                      {formatKRW(fund.size)}
                      {fund.currency && fund.currency !== "KRW" && (
                        <span className="ml-1 text-xs text-muted-foreground">
                          {fund.currency}
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      포트폴리오 {fund.companies.length}건
                    </div>
                  </div>
                </summary>

                {fund.companies.length > 0 ? (
                  <div className="border-t border-border">
                    <table className="w-full text-sm">
                      <tbody>
                        {fund.companies.map((c) => (
                          <tr
                            key={c.id}
                            className="border-b border-border last:border-0"
                          >
                            <td className="px-4 py-2 pl-12">
                              <span className="font-medium">{c.nameKr}</span>
                              {c.nameEn && (
                                <span className="ml-1.5 text-xs text-muted-foreground">
                                  {c.nameEn}
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-2 text-muted-foreground">
                              {c.sectorRaw ?? "—"}
                            </td>
                            <td className="px-4 py-2 text-right">
                              <Badge
                                variant={
                                  LISTING_STATUS_VARIANT[c.status as ListingStatus] ??
                                  "outline"
                                }
                              >
                                {c.status}
                              </Badge>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="border-t border-border px-4 py-3 pl-12 text-xs text-muted-foreground">
                    연결된 포트폴리오가 없습니다.
                  </div>
                )}
              </details>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
