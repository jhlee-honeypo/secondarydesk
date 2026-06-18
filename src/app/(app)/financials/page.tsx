import { createClient } from "@/lib/supabase/server";
import type { FinancialStatement } from "@/lib/types";
import { fundLabel, formatWon, formatDate } from "@/lib/format";
import {
  computeMetrics,
  gradeHealth,
  HEALTH_LABEL,
  type HealthLevel,
} from "@/lib/financial-health";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { FinancialsClient } from "./_components/financials-client";
import { FinancialsFilters } from "./_components/financials-filters";
import { BoardFileViewer } from "./_components/board-file-viewer";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // Claude 추출 배치(서버 액션)용 여유 타임아웃

const HEALTH_VARIANT: Record<HealthLevel, "destructive" | "secondary" | "outline"> = {
  danger: "destructive",
  warning: "secondary",
  good: "outline",
};

function pct(v: number | null): string {
  return v === null ? "—" : `${(v * 100).toFixed(0)}%`;
}
function months(v: number | null): string {
  return v === null ? "흑자/충분" : `${v.toFixed(1)}개월`;
}
// slab 투자유치여부 영문 원문 → 한글
const FUNDING_LABEL: Record<string, string> = {
  None: "없음",
  Done: "완료",
  Expected: "예정",
  Ongoing: "진행중",
};
function fundingLabel(v: string): string {
  return FUNDING_LABEL[v] ?? v;
}

const RED = "bg-rose-100 font-medium text-rose-700 dark:bg-rose-950/40 dark:text-rose-300";
const YELLOW =
  "bg-amber-100 font-medium text-amber-700 dark:bg-amber-950/40 dark:text-amber-300";

// 런웨이 3개월 미만 → 빨강
function runwayClass(v: number | null): string {
  return v !== null && v < 3 ? RED : "";
}
// 자본잠식률 0~50% → 노랑, 50% 초과 → 빨강 (잠식 없음/음수는 강조 안 함)
function erosionClass(v: number | null): string {
  if (v === null || v <= 0) return "";
  return v > 0.5 ? RED : YELLOW;
}
// 회사명 매칭용 정규화(법인격·공백·구두점 제거)
function normName(s: string): string {
  return s
    .toLowerCase()
    .replace(/㈜|\(주\)|주식회사/g, "")
    .replace(/[\s.,·]/g, "");
}

type ListingRow = {
  id: string;
  company_name: string;
  company_name_en: string | null;
  bubble_id: string | null;
};

export default async function FinancialsPage({
  searchParams,
}: {
  searchParams: Promise<{ fund?: string; period?: string }>;
}) {
  const { fund = "", period = "" } = await searchParams;
  const supabase = await createClient();

  const [{ data: fundRows }, { data: periodRows }] = await Promise.all([
    supabase.from("holding_funds").select("id, name, short_name").order("name"),
    // 분기 옵션은 저장된 재무 데이터의 연도·보고월에서 도출
    supabase
      .from("financial_statements")
      .select("report_year, report_month")
      .order("report_year", { ascending: false })
      .order("report_month", { ascending: false }),
  ]);

  const fundOptions = [
    { value: "", label: "전체 (선택 안 함)" },
    ...(fundRows ?? []).map((f) => ({
      value: f.id as string,
      label: fundLabel(f as { name: string; short_name: string | null }),
    })),
  ];

  const periodSeen = new Set<string>();
  const periodOptions = [
    { value: "", label: "최신 분기" },
    ...(periodRows ?? [])
      .map((p) => `${p.report_year}-${p.report_month}`)
      .filter((k) => (periodSeen.has(k) ? false : (periodSeen.add(k), true)))
      .map((k) => {
        const [y, m] = k.split("-").map(Number);
        return { value: k, label: `${y}년 ${m / 3}분기` };
      }),
  ];

  const [selY, selM] = period ? period.split("-").map(Number) : [0, 0];

  // 선택한 조합의 매물 목록 + 각 매물에 매칭되는 재무 데이터(분기 지정 시 그 분기, 아니면 최신)
  let roster: { listing: ListingRow; fin: FinancialStatement | null }[] = [];

  if (fund) {
    const { data: lf } = await supabase
      .from("listing_funds")
      .select("listing_id")
      .eq("holding_fund_id", fund);
    const listingIds = (lf ?? []).map((r) => r.listing_id as string);

    if (listingIds.length > 0) {
      const [{ data: listingRows }, { data: finRows }] = await Promise.all([
        supabase
          .from("listings")
          .select("id, company_name, company_name_en, bubble_id")
          .in("id", listingIds)
          .order("company_name"),
        supabase
          .from("financial_statements")
          .select("*")
          .order("report_year", { ascending: false })
          .order("report_month", { ascending: false }),
      ]);

      const byBubble = new Map<string, FinancialStatement>();
      const byName = new Map<string, FinancialStatement>();
      for (const f of (finRows ?? []) as FinancialStatement[]) {
        // 분기 지정 시 그 분기만, 미지정 시 desc 정렬상 첫 건(=최신)
        if (period && (f.report_year !== selY || f.report_month !== selM)) continue;
        if (f.bubble_company_id && !byBubble.has(f.bubble_company_id))
          byBubble.set(f.bubble_company_id, f);
        const n = normName(f.company_name);
        if (!byName.has(n)) byName.set(n, f);
      }

      roster = ((listingRows ?? []) as ListingRow[]).map((l) => ({
        listing: l,
        fin:
          (l.bubble_id ? byBubble.get(l.bubble_id) : undefined) ??
          byName.get(normName(l.company_name)) ??
          null,
      }));
    }
  }

  const graded = roster
    .filter((r) => r.fin)
    .map((r) => {
      const metrics = computeMetrics(r.fin!);
      return { health: gradeHealth(r.fin!, metrics).level };
    });
  const counts = {
    danger: graded.filter((g) => g.health === "danger").length,
    warning: graded.filter((g) => g.health === "warning").length,
    good: graded.filter((g) => g.health === "good").length,
    none: roster.length - graded.length,
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">재무 점검</h1>
          <p className="text-sm text-muted-foreground">
            조합을 선택하면 소속 매물의 재무상태를 점검합니다.
          </p>
        </div>
        <FinancialsClient />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <FinancialsFilters
          funds={fundOptions}
          periods={periodOptions}
          fund={fund}
          period={period}
        />
        {fund && (
          <div className="flex gap-2 text-sm">
            <Badge variant="destructive">위험 {counts.danger}</Badge>
            <Badge variant="secondary">주의 {counts.warning}</Badge>
            <Badge variant="outline">양호 {counts.good}</Badge>
            <Badge variant="outline" className="text-muted-foreground">
              데이터 없음 {counts.none}
            </Badge>
          </div>
        )}
      </div>

      {!fund ? (
        <Card className="p-10 text-center text-sm text-muted-foreground">
          상단에서 <b>조합</b>을 선택하면 소속 매물 목록과 재무상태가 표시됩니다.
        </Card>
      ) : roster.length === 0 ? (
        <Card className="p-10 text-center text-sm text-muted-foreground">
          이 조합에 연결된 매물이 없습니다.
        </Card>
      ) : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2">상태</th>
                <th className="px-3 py-2">회사</th>
                <th className="px-3 py-2">기준</th>
                <th className="px-3 py-2 text-right">보유현금</th>
                <th className="px-3 py-2 text-right">월평균매출</th>
                <th className="px-3 py-2 text-right">런웨이</th>
                <th className="px-3 py-2 text-right">자본잠식률</th>
                <th className="px-3 py-2 text-right">매출성장</th>
                <th className="px-3 py-2">손익</th>
                <th className="px-3 py-2">근거</th>
                <th className="px-3 py-2">투자유치</th>
                <th className="px-3 py-2 text-right">직원</th>
                <th className="px-3 py-2">하이라이트</th>
              </tr>
            </thead>
            <tbody>
              {roster.map(({ listing, fin }) => {
                if (!fin) {
                  // 데이터 미수집/미제출 — 회색 빈 행
                  return (
                    <tr
                      key={listing.id}
                      className="border-b align-top text-muted-foreground/60 last:border-0"
                    >
                      <td className="px-3 py-2">
                        <Badge variant="outline" className="text-[10px]">
                          데이터 없음
                        </Badge>
                      </td>
                      <td className="px-3 py-2 font-medium">
                        {listing.company_name}
                        {listing.company_name_en && (
                          <span className="block text-xs">
                            {listing.company_name_en}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2">—</td>
                      <td className="px-3 py-2 text-right">—</td>
                      <td className="px-3 py-2 text-right">—</td>
                      <td className="px-3 py-2 text-right">—</td>
                      <td className="px-3 py-2 text-right">—</td>
                      <td className="px-3 py-2 text-right">—</td>
                      <td className="px-3 py-2">—</td>
                      <td className="px-3 py-2 text-xs">미수집</td>
                      <td className="px-3 py-2">—</td>
                      <td className="px-3 py-2 text-right">—</td>
                      <td className="px-3 py-2">—</td>
                    </tr>
                  );
                }
                const metrics = computeMetrics(fin);
                const health = gradeHealth(fin, metrics);
                return (
                  <tr key={listing.id} className="border-b align-top last:border-0">
                    <td className="px-3 py-2">
                      <Badge variant={HEALTH_VARIANT[health.level]}>
                        {HEALTH_LABEL[health.level]}
                      </Badge>
                    </td>
                    <td className="px-3 py-2 font-medium">
                      {listing.company_name}
                      {listing.company_name_en && (
                        <span className="block text-xs text-muted-foreground">
                          {listing.company_name_en}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">
                      {fin.report_year} · {fin.report_month / 3}분기
                      <span className="block text-[10px]">
                        {fin.source === "slab" ? "slab" : "업로드"}
                      </span>
                      {fin.source_file_url && (
                        <span className="mt-0.5 block">
                          <BoardFileViewer fin={fin} />
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right">{formatWon(metrics.heldCash)}</td>
                    <td className="px-3 py-2 text-right">
                      {formatWon(metrics.monthlyRevenue)}
                    </td>
                    <td
                      className={cn(
                        "px-3 py-2 text-right whitespace-nowrap",
                        runwayClass(metrics.runwayMonths),
                      )}
                    >
                      {months(metrics.runwayMonths)}
                    </td>
                    <td
                      className={cn(
                        "px-3 py-2 text-right",
                        erosionClass(metrics.capitalErosion),
                      )}
                    >
                      {pct(metrics.capitalErosion)}
                    </td>
                    <td className="px-3 py-2 text-right">{pct(metrics.revenueGrowth)}</td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {metrics.isProfit ? (
                        <span className="text-emerald-600">흑자</span>
                      ) : (
                        <span className="text-rose-600">적자</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">
                      {health.reasons.join(", ")}
                      <span className="mt-0.5 block text-[10px]">
                        갱신 {formatDate(fin.updated_at)}
                      </span>
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {fin.funding_round ? fundingLabel(fin.funding_round) : "—"}
                      {fin.funding_series && (
                        <span className="block text-[10px] text-muted-foreground">
                          {fin.funding_series}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">
                      {typeof fin.head_count === "number"
                        ? `${fin.head_count}명`
                        : "—"}
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">
                      {fin.business_highlight ? (
                        <span
                          className="line-clamp-2 max-w-[20rem] whitespace-pre-wrap"
                          title={fin.business_highlight}
                        >
                          {fin.business_highlight}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
