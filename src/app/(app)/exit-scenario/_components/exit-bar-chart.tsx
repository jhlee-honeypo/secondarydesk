import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { ProjectionRow } from "@/lib/exit-scenario";

/** v 이상이 되는 가장 가까운 '깔끔한' 상한값(1·2·2.5·5·10 × 10ⁿ). */
function niceCeil(v: number): number {
  if (v <= 0) return 0;
  const mag = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / mag;
  const nice = n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10;
  return nice * mag;
}

const TICK_COUNT = 5; // 0 포함 6개 라인

export function ExitBarChart({
  rows,
  principal,
  compareRows,
  baseLabel = "현재(최신 단가)",
  compareLabel = "다음 라운드(예상)",
}: {
  rows: ProjectionRow[];
  principal: number;
  /** 비교 시리즈(다음 라운드 예상 단가 기준). 있으면 그룹 막대로 나란히 표시. */
  compareRows?: ProjectionRow[];
  baseLabel?: string;
  compareLabel?: string;
}) {
  const compare = compareRows && compareRows.length > 0 ? compareRows : null;

  const rawMax = Math.max(
    principal,
    ...rows.map((r) => r.saleTotal),
    ...(compare ? compare.map((r) => r.saleTotal) : []),
    0,
  );
  const max = niceCeil(rawMax);

  const ticks = Array.from({ length: TICK_COUNT + 1 }, (_, i) =>
    Math.round((max / TICK_COUNT) * i),
  );

  const pct = (v: number) => (max > 0 ? (v / max) * 100 : 0);
  // 천원 단위 라벨
  const kLabel = (v: number) => Math.round(v / 1000).toLocaleString("ko-KR");

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">할인율별 매각 총액</CardTitle>
      </CardHeader>
      <CardContent>
        {compare && (
          <div className="mb-3 flex flex-wrap items-center gap-4 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="inline-block size-2.5 rounded-sm bg-sky-500/80" />
              {baseLabel}
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block size-2.5 rounded-sm bg-violet-500/80" />
              {compareLabel}
            </span>
          </div>
        )}

        <div className="flex gap-2">
          {/* Y축 라벨 (천원) */}
          <div className="flex h-72 w-14 flex-col-reverse justify-between py-0 text-right text-[10px] text-muted-foreground">
            {ticks.map((t) => (
              <span key={t} className="leading-none">
                {kLabel(t)}
              </span>
            ))}
          </div>

          <div className="min-w-0 flex-1">
            {/* 플롯 영역 */}
            <div className="relative h-72 border-b border-l border-border">
              {/* 가로 그리드라인 */}
              {ticks.map((t) => (
                <div
                  key={t}
                  className="absolute inset-x-0 border-t border-border/50"
                  style={{ bottom: `${pct(t)}%` }}
                />
              ))}

              {/* 총 투자원금 기준선(점선) */}
              {principal > 0 && max > 0 && (
                <div
                  className="absolute inset-x-0 border-t border-dashed border-foreground/60"
                  style={{ bottom: `${pct(principal)}%` }}
                >
                  <span className="absolute right-0 -top-4 rounded bg-background/80 px-1 text-[10px] font-medium text-foreground/70">
                    총 투자원금
                  </span>
                </div>
              )}

              {/* 막대 */}
              <div className="absolute inset-0 flex items-end gap-1 px-1">
                {rows.map((r, i) => {
                  const c = compare ? compare[i] : null;
                  return (
                    <div
                      key={r.discount}
                      className="flex h-full flex-1 items-end justify-center gap-0.5"
                    >
                      {c ? (
                        <>
                          <div
                            className="w-[42%] rounded-t-sm bg-sky-500/80 transition-[height] dark:bg-sky-500/70"
                            style={{ height: `${pct(r.saleTotal)}%` }}
                            title={`${baseLabel} · ${Math.round(r.discount * 100)}% · ${kLabel(r.saleTotal)}천원`}
                          />
                          <div
                            className="w-[42%] rounded-t-sm bg-violet-500/80 transition-[height] dark:bg-violet-500/70"
                            style={{ height: `${pct(c.saleTotal)}%` }}
                            title={`${compareLabel} · ${Math.round(c.discount * 100)}% · ${kLabel(c.saleTotal)}천원`}
                          />
                        </>
                      ) : (
                        <div
                          className={cn(
                            "w-2/3 rounded-t-sm transition-[height]",
                            r.isProfit
                              ? "bg-emerald-500/80 dark:bg-emerald-500/70"
                              : "bg-red-400/80 dark:bg-red-500/60",
                          )}
                          style={{ height: `${pct(r.saleTotal)}%` }}
                          title={`${Math.round(r.discount * 100)}% · ${kLabel(r.saleTotal)}천원`}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* X축 라벨 (할인율) */}
            <div className="flex gap-1 px-1 pt-1.5 text-[10px] text-muted-foreground">
              {rows.map((r) => (
                <span key={r.discount} className="flex-1 text-center">
                  {Math.round(r.discount * 100)}%
                </span>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-2 flex justify-between px-1 text-[10px] text-muted-foreground">
          <span>매각 총액 (천원)</span>
          <span>할인율</span>
        </div>
      </CardContent>
    </Card>
  );
}
