import Link from "next/link";
import { Pencil, Plus, Trash2 } from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import {
  HOLDING_FUND_STATUS_VARIANT,
  type HoldingFund,
} from "@/lib/types";
import { formatDate } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { DeleteDialog } from "@/components/app/delete-dialog";
import { HoldingFundFormDialog } from "../_components/holding-fund-form-dialog";
import { deleteHoldingFund } from "../actions";

export const dynamic = "force-dynamic";

export default async function HoldingFundsPage() {
  const supabase = await createClient();

  // 각 운용펀드에 태깅된 매물 수를 함께 집계
  const { data: fundRows } = await supabase
    .from("holding_funds")
    .select("*, listing_funds(id)")
    .order("name");

  const funds = (fundRows ?? []) as (HoldingFund & {
    listing_funds: { id: string }[];
  })[];

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6">
      <Link
        href="/listings"
        className="text-sm text-muted-foreground hover:text-foreground"
      >
        ← 매물 목록
      </Link>

      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">운용펀드</h1>
          <p className="text-sm text-muted-foreground">
            우리가 운용·매각하는 펀드 마스터입니다. 매물 등록 시 소속으로
            태깅합니다.
          </p>
        </div>
        <HoldingFundFormDialog
          trigger={
            <Button>
              <Plus />
              운용펀드
            </Button>
          }
        />
      </div>

      {funds.length === 0 ? (
        <Card className="items-center justify-center py-16 text-center">
          <p className="text-sm text-muted-foreground">
            아직 등록된 운용펀드가 없습니다. 오른쪽 위 “운용펀드” 버튼으로 첫
            펀드를 등록하세요.
          </p>
        </Card>
      ) : (
        <Card className="p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th className="px-4 py-2.5 font-medium">펀드명</th>
                <th className="px-4 py-2.5 font-medium">상태</th>
                <th className="px-4 py-2.5 font-medium">결성연도</th>
                <th className="px-4 py-2.5 font-medium">만기일</th>
                <th className="px-4 py-2.5 font-medium">보유 매물</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {funds.map((fund) => (
                <tr
                  key={fund.id}
                  className="border-b border-border last:border-0 hover:bg-muted/40"
                >
                  <td className="px-4 py-3 font-medium">{fund.name}</td>
                  <td className="px-4 py-3">
                    {fund.status ? (
                      <Badge variant={HOLDING_FUND_STATUS_VARIANT[fund.status]}>
                        {fund.status}
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {fund.vintage ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {formatDate(fund.maturity_date)}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {fund.listing_funds.length}건
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      <HoldingFundFormDialog
                        fund={fund}
                        trigger={
                          <Button
                            variant="ghost"
                            size="icon-xs"
                            aria-label="운용펀드 수정"
                          >
                            <Pencil />
                          </Button>
                        }
                      />
                      <DeleteDialog
                        trigger={
                          <Button
                            variant="ghost"
                            size="icon-xs"
                            aria-label="운용펀드 삭제"
                          >
                            <Trash2 />
                          </Button>
                        }
                        title="운용펀드를 삭제할까요?"
                        description={`'${fund.name}' 운용펀드를 삭제합니다. 매물의 소속 태그도 함께 제거됩니다.`}
                        action={deleteHoldingFund.bind(null, fund.id)}
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
