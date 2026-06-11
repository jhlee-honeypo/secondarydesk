"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Field } from "@/components/app/field";
import { computeProjection, computeTotals } from "@/lib/exit-scenario";
import type { ExitScenarioRound } from "@/lib/types";
import { getListingRounds } from "../../listings/actions";
import { SummaryCards } from "./summary-cards";
import { ProjectionTable } from "./projection-table";
import { ExitBarChart } from "./exit-bar-chart";

function friendlyError(msg: string): string {
  if (/exit_scenario_rounds|schema cache/i.test(msg)) {
    return "EXIT 시나리오 저장 테이블이 아직 없습니다. 마이그레이션(20260611000003_exit_scenario_rounds.sql)을 Supabase에 적용해 주세요.";
  }
  return msg;
}

const FUND_ALL = "all";

export function ExitScenarioTool({
  listings,
  holdingFunds = [],
  listingFundMap = {},
}: {
  listings: { id: string; company_name: string }[];
  holdingFunds?: { id: string; name: string }[];
  listingFundMap?: Record<string, string[]>;
}) {
  const [fundFilter, setFundFilter] = useState(FUND_ALL);
  const [listingId, setListingId] = useState("");
  const [rounds, setRounds] = useState<ExitScenarioRound[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const filteredListings = listings.filter(
    (l) =>
      fundFilter === FUND_ALL ||
      (listingFundMap[l.id] ?? []).includes(fundFilter),
  );

  // 조합 필터 변경 시, 현재 선택 매물이 필터에서 빠지면 선택 해제
  function onFundChange(next: string) {
    setFundFilter(next);
    if (
      listingId &&
      next !== FUND_ALL &&
      !(listingFundMap[listingId] ?? []).includes(next)
    ) {
      setListingId("");
    }
  }

  // 매물 선택 시 매물에 입력된 투자 라운드를 불러온다(보기 전용).
  useEffect(() => {
    if (!listingId) {
      setRounds(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    getListingRounds(listingId).then((res) => {
      if (cancelled) return;
      if (res.ok) setRounds(res.rounds);
      else {
        setError(friendlyError(res.error));
        setRounds([]);
      }
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [listingId]);

  const calcRounds = (rounds ?? []).map((r) => ({
    amount: r.amount || 0,
    unitPrice: r.unit_price || 0,
    shares: r.shares || 0,
  }));
  const totals = computeTotals(calcRounds);
  const projection = computeProjection(totals);
  const hasScenario = totals.totalShares > 0 && totals.baseUnitPrice > 0;

  return (
    <div className="space-y-6">
      {/* 매물 선택 — 운용펀드로 먼저 구분 후 매물 선택 */}
      <Card>
        <CardContent className="flex flex-wrap items-end gap-4 pt-6">
          {holdingFunds.length > 0 && (
            <Field label="운용펀드">
              <Select value={fundFilter} onValueChange={onFundChange}>
                <SelectTrigger className="w-full sm:w-56">
                  <SelectValue placeholder="운용펀드" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={FUND_ALL}>전체 운용펀드</SelectItem>
                  {holdingFunds.map((f) => (
                    <SelectItem key={f.id} value={f.id}>
                      {f.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          )}

          <Field label="대상 매물">
            <Select value={listingId || undefined} onValueChange={setListingId}>
              <SelectTrigger className="w-full sm:w-80">
                <SelectValue placeholder="매물 선택" />
              </SelectTrigger>
              <SelectContent>
                {filteredListings.length === 0 ? (
                  <div className="px-2 py-1.5 text-sm text-muted-foreground">
                    {listings.length === 0
                      ? "등록된 매물이 없습니다."
                      : "이 운용펀드에 속한 매물이 없습니다."}
                  </div>
                ) : (
                  filteredListings.map((l) => (
                    <SelectItem key={l.id} value={l.id}>
                      {l.company_name}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </Field>

          {error && (
            <p className="w-full text-sm text-destructive" role="alert">
              {error}
            </p>
          )}
        </CardContent>
      </Card>

      {/* 결과 */}
      {!listingId ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            매물을 선택하면 EXIT 시나리오가 표시됩니다.
          </CardContent>
        </Card>
      ) : loading ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            불러오는 중…
          </CardContent>
        </Card>
      ) : hasScenario ? (
        <>
          <SummaryCards
            totals={totals}
            roundShares={calcRounds.map((r) => r.shares)}
          />
          <ProjectionTable rows={projection} />
          <ExitBarChart rows={projection} principal={totals.totalPrincipal} />
        </>
      ) : (
        <Card>
          <CardContent className="space-y-2 py-10 text-center text-sm text-muted-foreground">
            <p>이 매물에는 투자 데이터가 없습니다.</p>
            <p>
              <Link
                href={`/listings/${listingId}`}
                className="font-medium text-primary hover:underline"
              >
                매물 상세
              </Link>{" "}
              또는 매물 수정에서 라운드별 단가·주식수를 입력하세요.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
