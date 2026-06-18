import type { Fund } from "@/lib/types";
import { estimateDryPowder, formatToEokWon } from "@/lib/fund-dry-powder";

// 펀드 생애 단계 라벨(한글)
const STAGE_LABEL: Record<
  "ramp-up" | "peak-deployment" | "tail" | "harvest" | "matured",
  string
> = {
  "ramp-up": "초기 집행",
  "peak-deployment": "집중 집행",
  tail: "투자기간 말",
  harvest: "회수기",
  matured: "만기",
};

/**
 * 조합별 드라이파우더(미소진 약정액) 추정치를 막대로 시각화.
 * 회색 = 소진(추정 집행), 초록 = 미소진(드라이파우더). 실측 드라이파우더 입력 시 실측 우선.
 */
export function FundDryPowderCell({ fund }: { fund: Fund }) {
  // 결성일(일단위) 우선, 없으면 결성연도 1/1 폴백
  const formation = fund.formation_date
    ? new Date(fund.formation_date)
    : fund.vintage !== null
      ? new Date(fund.vintage, 0, 1)
      : null;
  // 추정 최소 조건: 결성총액(aum) + 결성일/연도
  if (!fund.aum || !formation) {
    return <span className="text-xs text-muted-foreground/60">—</span>;
  }

  const r = estimateDryPowder({
    commitmentTotal: fund.aum,
    formationDate: formation,
    maturityDate: fund.maturity_date ?? undefined,
    // 실측 드라이파우더가 입력돼 있으면 누적집행액 = 결성총액 − 드라이파우더(실측 우선)
    actualInvestedAmount:
      fund.dry_powder !== null ? Math.max(0, fund.aum - fund.dry_powder) : undefined,
  });

  const investedPct = Math.round(r.cumulativeInvestedRatio * 100);
  const dryPct = Math.round(r.dryPowderRatio * 100);

  return (
    <div
      className="w-44 space-y-1"
      title={`결성연도·만기 기반 추정 — 소진 ${investedPct}% / 미소진 ${dryPct}% (경과 ${r.elapsedYears}년). 실측 드라이파우더 입력 시 실측값 사용.`}
    >
      <div className="flex items-baseline justify-between text-[11px]">
        <span className="font-medium tabular-nums text-emerald-700 dark:text-emerald-400">
          {formatToEokWon(r.dryPowderAmount)}
        </span>
        <span className="tabular-nums text-muted-foreground">{dryPct}%</span>
      </div>
      <div className="flex h-2 w-full overflow-hidden rounded-full bg-muted">
        <div
          className="h-full bg-muted-foreground/25"
          style={{ width: `${r.cumulativeInvestedRatio * 100}%` }}
        />
        <div
          className="h-full bg-emerald-500"
          style={{ width: `${r.dryPowderRatio * 100}%` }}
        />
      </div>
      <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
        <span>{STAGE_LABEL[r.stage]}</span>
        <span>·</span>
        <span>{r.source === "actual" ? "실측" : "추정"}</span>
      </div>
    </div>
  );
}
