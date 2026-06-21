"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/app/field";
import { formatWon } from "@/lib/format";
import { cn } from "@/lib/utils";
import { computeProjection, computeTotals } from "@/lib/exit-scenario";
import type { ExitScenarioRound } from "@/lib/types";
import { getListingRounds, getListingErpShares } from "../../listings/actions";
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
const FUND_NONE = "__none__"; // 소속 펀드 미지정 라운드

// 숫자 입력(콤마·공백 허용) → 원 단위 숫자. 비유효 시 0.
function parseWon(s: string): number {
  const n = Number(s.replace(/[^\d.]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

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
  const [latestPrice, setLatestPrice] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // 결과를 특정 소속 펀드로 매칭(필터)할 때 사용. FUND_ALL = 전체 합산.
  const [resultFund, setResultFund] = useState(FUND_ALL);
  // 다음 라운드 예상 단가(원/주). 입력 시 비교 시리즈를 함께 표시.
  const [nextPriceStr, setNextPriceStr] = useState("");
  // 단가 입력 방식: 직접 입력 vs 밸류에이션으로 추정.
  const [priceMode, setPriceMode] = useState<"direct" | "estimate">("direct");
  // 추정 모드 입력값(모두 숫자문자열).
  const [valStr, setValStr] = useState(""); // 다음 라운드 포스트머니 밸류에이션(원)
  const [raiseStr, setRaiseStr] = useState(""); // 모집 목표 금액(원, 전액 신주)
  const [sharesStr, setSharesStr] = useState(""); // 현재 총 발행주식수(완전희석, 주)
  // slab(sparkERP)에서 자동으로 끌어온 발행주식총수(있으면 입력칸에 자동 반영).
  const [erpShares, setErpShares] = useState<number | null>(null);
  const [erpLoading, setErpLoading] = useState(false);
  const [erpTried, setErpTried] = useState(false);
  const erpLoadedRef = useRef<string | null>(null); // 매물별 ERP 조회 중복 방지

  const fundName = (key: string) =>
    key === FUND_NONE
      ? "미지정"
      : (holdingFunds.find((f) => f.id === key)?.name ?? "기타");

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
      setLatestPrice(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    setResultFund(FUND_ALL); // 매물 바꾸면 펀드 매칭 초기화
    setNextPriceStr(""); // 매물 바꾸면 다음 라운드 단가 입력 초기화
    setPriceMode("direct");
    setValStr("");
    setRaiseStr("");
    setSharesStr("");
    setErpShares(null);
    setErpLoading(false);
    setErpTried(false);
    erpLoadedRef.current = null;
    getListingRounds(listingId).then((res) => {
      if (cancelled) return;
      if (res.ok) {
        setRounds(res.rounds);
        setLatestPrice(res.latestPrice ?? null);
      } else {
        setError(friendlyError(res.error));
        setRounds([]);
        setLatestPrice(null);
      }
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [listingId]);

  // 추정 모드 진입 시 slab(sparkERP)에서 발행주식총수를 한 번 끌어와 자동 반영.
  // 매물당 1회만 조회(erpLoadedRef). 사용자가 값을 입력했으면 덮어쓰지 않는다.
  useEffect(() => {
    if (priceMode !== "estimate" || !listingId) return;
    if (erpLoadedRef.current === listingId) return;
    erpLoadedRef.current = listingId;
    let cancelled = false;
    setErpLoading(true);
    getListingErpShares(listingId).then((res) => {
      if (cancelled) return;
      setErpLoading(false);
      setErpTried(true);
      if (res.ok) {
        setErpShares(res.sharesOutstanding);
        if (res.sharesOutstanding && res.sharesOutstanding > 0) {
          setSharesStr((prev) => prev || String(res.sharesOutstanding));
        }
      }
    });
    return () => {
      cancelled = true;
    };
  }, [listingId, priceMode]);

  const allRounds = rounds ?? [];
  // 라운드에 존재하는 소속 펀드 키 목록(미지정 포함). 2개 이상이면 펀드별 매칭 노출.
  const fundKeys = Array.from(
    new Set(allRounds.map((r) => r.holding_fund_id ?? FUND_NONE)),
  );
  const multiFund = fundKeys.length > 1;

  const shownRounds =
    resultFund === FUND_ALL
      ? allRounds
      : allRounds.filter((r) => (r.holding_fund_id ?? FUND_NONE) === resultFund);

  const calcRounds = shownRounds.map((r) => ({
    amount: r.amount || 0,
    unitPrice: r.unit_price || 0,
    shares: r.shares || 0,
  }));
  const totals = computeTotals(calcRounds, latestPrice);
  const projection = computeProjection(totals);
  const hasScenario = totals.totalShares > 0 && totals.baseUnitPrice > 0;

  // 다음 라운드 예상 단가 비교 — 같은 라운드/주식수에 기준단가만 바꿔 재계산.
  // 단가는 직접 입력하거나, 포스트머니 밸류에이션 − 모집금액(전액 신주)을
  // 현재 총 발행주식수로 나눠 추정한다(단가 = pre-money ÷ 주식수).
  const directPrice = parseWon(nextPriceStr);
  const nextValuation = parseWon(valStr);
  const nextRaise = parseWon(raiseStr);
  const totalShares = parseWon(sharesStr);
  const preMoney = nextValuation - nextRaise;
  const estimatedPrice =
    totalShares > 0 && preMoney > 0 ? Math.round(preMoney / totalShares) : 0;
  const nextPrice = priceMode === "estimate" ? estimatedPrice : directPrice;
  const hasCompare = hasScenario && nextPrice > 0;
  const compareTotals = hasCompare
    ? computeTotals(calcRounds, nextPrice)
    : null;
  const compareProjection = compareTotals
    ? computeProjection(compareTotals)
    : null;
  // 현재 기준단가 대비 다음 라운드 단가 변동률(%)
  const priceDelta =
    totals.baseUnitPrice > 0
      ? (nextPrice / totals.baseUnitPrice - 1) * 100
      : 0;

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
          {multiFund && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-muted-foreground">펀드별 결과</span>
              <Select value={resultFund} onValueChange={setResultFund}>
                <SelectTrigger className="w-full sm:w-60" aria-label="펀드별 결과">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={FUND_ALL}>전체 합산</SelectItem>
                  {fundKeys.map((k) => (
                    <SelectItem key={k} value={k}>
                      {fundName(k)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <SummaryCards
            totals={totals}
            roundShares={calcRounds.map((r) => r.shares)}
          />
          <ProjectionTable rows={projection} />

          <ExitBarChart
            rows={projection}
            principal={totals.totalPrincipal}
            compareRows={compareProjection ?? undefined}
          />

          {/* 다음 라운드 예상 단가 → 비교 시리즈 표시 (차트 아래 배치).
              단가는 직접 입력하거나 포스트머니 밸류에이션으로 추정한다. */}
          <Card>
            <CardContent className="space-y-4 pt-6">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium">다음 라운드 예상 단가</span>
                <div className="ml-auto inline-flex rounded-lg border border-border p-0.5 text-xs">
                  <button
                    type="button"
                    onClick={() => setPriceMode("direct")}
                    className={cn(
                      "rounded-md px-2.5 py-1 transition-colors",
                      priceMode === "direct"
                        ? "bg-muted font-medium text-foreground"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    단가 직접 입력
                  </button>
                  <button
                    type="button"
                    onClick={() => setPriceMode("estimate")}
                    className={cn(
                      "rounded-md px-2.5 py-1 transition-colors",
                      priceMode === "estimate"
                        ? "bg-muted font-medium text-foreground"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    밸류에이션으로 추정
                  </button>
                </div>
              </div>

              {priceMode === "direct" ? (
                <div className="flex flex-wrap items-end gap-4">
                  <Field label="다음 라운드 예상 단가 (원/주)">
                    <Input
                      inputMode="numeric"
                      value={
                        nextPriceStr
                          ? Number(nextPriceStr).toLocaleString("ko-KR")
                          : ""
                      }
                      onChange={(e) =>
                        setNextPriceStr(e.target.value.replace(/[^\d]/g, ""))
                      }
                      placeholder={`예: ${Math.round(totals.baseUnitPrice).toLocaleString("ko-KR")}`}
                      className="w-full sm:w-56"
                    />
                  </Field>
                  <p className="pb-2 text-xs text-muted-foreground">
                    현재 기준단가(최신 라운드){" "}
                    <span className="font-medium text-foreground">
                      {formatWon(totals.baseUnitPrice)}
                    </span>{" "}
                    /주 와 비교합니다.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="grid gap-4 sm:grid-cols-3">
                    <Field label="다음 라운드 밸류에이션 (포스트머니, 원)">
                      <Input
                        inputMode="numeric"
                        value={
                          valStr ? Number(valStr).toLocaleString("ko-KR") : ""
                        }
                        onChange={(e) =>
                          setValStr(e.target.value.replace(/[^\d]/g, ""))
                        }
                        placeholder="예: 30,000,000,000"
                      />
                    </Field>
                    <Field label="모집 목표 금액 (원, 전액 신주)">
                      <Input
                        inputMode="numeric"
                        value={
                          raiseStr
                            ? Number(raiseStr).toLocaleString("ko-KR")
                            : ""
                        }
                        onChange={(e) =>
                          setRaiseStr(e.target.value.replace(/[^\d]/g, ""))
                        }
                        placeholder="예: 5,000,000,000"
                      />
                    </Field>
                    <Field label="현재 총 발행주식수 (완전희석, 주)">
                      <Input
                        inputMode="numeric"
                        value={
                          sharesStr
                            ? Number(sharesStr).toLocaleString("ko-KR")
                            : ""
                        }
                        onChange={(e) =>
                          setSharesStr(e.target.value.replace(/[^\d]/g, ""))
                        }
                        placeholder="예: 1,000,000"
                      />
                      {erpLoading ? (
                        <p className="mt-1 text-xs text-muted-foreground">
                          slab에서 발행주식총수 불러오는 중…
                        </p>
                      ) : erpShares && erpShares > 0 ? (
                        <p className="mt-1 text-xs text-emerald-600 dark:text-emerald-400">
                          slab 발행주식총수 {erpShares.toLocaleString("ko-KR")}주
                          자동 반영 · 수정 가능
                        </p>
                      ) : erpTried ? (
                        <p className="mt-1 text-xs text-muted-foreground">
                          slab에 연결된 발행주식총수가 없어 직접 입력이
                          필요합니다.
                        </p>
                      ) : null}
                    </Field>
                  </div>
                  <div className="rounded-lg bg-muted/40 p-3 text-sm">
                    {estimatedPrice > 0 ? (
                      <span className="text-muted-foreground">
                        추정 단가{" "}
                        <span className="font-semibold text-foreground tabular-nums">
                          {formatWon(estimatedPrice)}
                        </span>
                        /주{" "}
                        <span className="text-xs">
                          = (포스트머니 {formatWon(nextValuation)} − 모집{" "}
                          {formatWon(nextRaise)}) ÷{" "}
                          {totalShares.toLocaleString("ko-KR")}주
                        </span>
                      </span>
                    ) : (
                      <span className="text-muted-foreground">
                        밸류에이션·모집금액·총발행주식수를 입력하면 추정 단가가
                        표시됩니다. (포스트머니 &gt; 모집금액, 주식수 &gt; 0)
                      </span>
                    )}
                  </div>
                </div>
              )}

              {hasCompare && compareTotals && (
                <div className="flex flex-wrap items-center gap-x-6 gap-y-1 rounded-lg bg-muted/40 p-3 text-sm">
                  <span className="text-muted-foreground">
                    다음 라운드 단가{" "}
                    <span className="font-semibold text-foreground tabular-nums">
                      {formatWon(nextPrice)}
                    </span>
                    /주{" "}
                    <span
                      className={cn(
                        "font-medium tabular-nums",
                        priceDelta >= 0
                          ? "text-emerald-600 dark:text-emerald-400"
                          : "text-destructive",
                      )}
                    >
                      ({priceDelta >= 0 ? "+" : ""}
                      {priceDelta.toFixed(1)}% vs 현재)
                    </span>
                  </span>
                  <span className="text-muted-foreground">
                    예상가치{" "}
                    <span className="font-semibold text-foreground tabular-nums">
                      {formatWon(compareTotals.currentValue)}
                    </span>
                  </span>
                  <span className="text-muted-foreground">
                    손익분기 할인율 ≈{" "}
                    <span className="font-semibold text-foreground tabular-nums">
                      {(compareTotals.breakevenDiscount * 100).toFixed(1)}%
                    </span>
                  </span>
                </div>
              )}
            </CardContent>
          </Card>
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
