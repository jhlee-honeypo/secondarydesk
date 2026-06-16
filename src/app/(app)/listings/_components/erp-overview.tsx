import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDate, formatWon } from "@/lib/format";
import type { ErpCompanyOverview } from "@/lib/bubble";

// 매물 상세 — sparkERP 원본 정보(주요 주식정보·스파크랩 투자·후속투자) 표시.
// 서버 컴포넌트(상세 페이지에서 데이터를 받아 렌더). fundNameByBubbleId 는
// sparkERP fund _id → 우리 운용펀드 표시명(없으면 미표기).
export function ErpOverview({
  overview,
  fundNameByBubbleId,
}: {
  overview: ErpCompanyOverview;
  fundNameByBubbleId: Map<string, string>;
}) {
  const { stock, investments, fundingRounds } = overview;
  const cur = stock.shareCurrency && stock.shareCurrency !== "KRW"
    ? ` ${stock.shareCurrency}`
    : "";

  return (
    <>
      {/* 주요 주식정보 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">주요 주식정보 (sparkERP)</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
            <Info label="기업가치">
              {stock.valuation ? `${formatWon(stock.valuation)}${cur || "원"}` : "—"}
            </Info>
            <Info label="마지막 투자라운드">{stock.lastRoundType ?? "—"}</Info>
            <Info label="마지막 투자유치일">
              {formatDate(stock.lastInvestDate)}
            </Info>
            <Info label="발행주식총수">
              {stock.sharesOutstanding
                ? `${stock.sharesOutstanding.toLocaleString("ko-KR")}주`
                : "—"}
            </Info>
            <Info label="주당가격">
              {stock.sharePrice
                ? `${formatWon(stock.sharePrice)}${cur || "원"}/주`
                : "—"}
            </Info>
            <Info label="투자 상태">{stock.investmentStatus ?? "—"}</Info>
          </dl>
        </CardContent>
      </Card>

      {/* 스파크랩 투자 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">스파크랩 투자 (sparkERP)</CardTitle>
        </CardHeader>
        <CardContent>
          {investments.length === 0 ? (
            <p className="text-sm text-muted-foreground">투자내역이 없습니다.</p>
          ) : (
            <div className="overflow-hidden rounded-lg border border-border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs text-muted-foreground">
                    <th className="px-3 py-2 font-medium">소속펀드</th>
                    <th className="px-3 py-2 text-right font-medium">투자단가</th>
                    <th className="px-3 py-2 text-right font-medium">주식수</th>
                    <th className="px-3 py-2 text-right font-medium">투자액</th>
                    <th className="px-3 py-2 text-right font-medium">지분율</th>
                    <th className="px-3 py-2 font-medium">상태</th>
                  </tr>
                </thead>
                <tbody>
                  {investments.map((inv, i) => (
                    <tr
                      key={i}
                      className="border-b border-border last:border-0"
                    >
                      <td className="px-3 py-2 text-muted-foreground">
                        {(inv.fundId && fundNameByBubbleId.get(inv.fundId)) || "—"}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {formatWon(inv.unitPrice)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {inv.shares.toLocaleString("ko-KR")}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {formatWon(inv.amount)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {inv.shareRatio != null
                          ? `${inv.shareRatio.toFixed(2)}%`
                          : "—"}
                      </td>
                      <td className="px-3 py-2">
                        <span className="text-xs text-muted-foreground">
                          {inv.status ?? "—"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 후속투자(분기현황 기반) */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">후속투자 (sparkERP)</CardTitle>
        </CardHeader>
        <CardContent>
          {fundingRounds.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              기록된 후속 투자 라운드가 없습니다.
            </p>
          ) : (
            <div className="overflow-hidden rounded-lg border border-border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs text-muted-foreground">
                    <th className="px-3 py-2 font-medium">시기</th>
                    <th className="px-3 py-2 font-medium">시리즈</th>
                    <th className="px-3 py-2 text-right font-medium">조달액</th>
                    <th className="px-3 py-2 text-right font-medium">주당가격</th>
                    <th className="px-3 py-2 text-right font-medium">발행주식</th>
                    <th className="px-3 py-2 font-medium">종료일</th>
                  </tr>
                </thead>
                <tbody>
                  {fundingRounds.map((r, i) => (
                    <tr key={i} className="border-b border-border last:border-0">
                      <td className="px-3 py-2 whitespace-nowrap">
                        {r.year ?? "—"} {r.quarter ?? ""}
                      </td>
                      <td className="px-3 py-2">{r.series ?? "—"}</td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {formatWon(r.amountRaised)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {formatWon(r.sharePrice)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {r.issuedShares
                          ? r.issuedShares.toLocaleString("ko-KR")
                          : "—"}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">
                        {formatDate(r.endDate)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 주식거래 — ERP 전용 타입(transaction)이 비어 있어 표시할 데이터 없음 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">주식거래 (sparkERP)</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            sparkERP에 등록된 주식거래(구주 거래) 내역이 없습니다.
          </p>
        </CardContent>
      </Card>
    </>
  );
}

function Info({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-foreground">{children}</dd>
    </div>
  );
}

// 사용처: 매물 상세에서 ERP 미매칭 시 안내 배지.
export function ErpUnmatchedNote() {
  return (
    <Badge variant="outline" className="text-xs font-normal text-muted-foreground">
      sparkERP 미매칭 매물
    </Badge>
  );
}
