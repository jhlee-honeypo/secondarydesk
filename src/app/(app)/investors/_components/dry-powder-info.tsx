import { Info } from "lucide-react";

import {
  sampleAnnualDeployment,
  DRY_POWDER_ASSUMPTIONS,
} from "@/lib/fund-dry-powder";

// 점들을 부드러운 곡선(Catmull-Rom → 3차 베지어)으로 잇는 SVG path 생성
function smoothPath(points: { x: number; y: number }[]): string {
  if (points.length < 2) return "";
  let d = `M${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] ?? points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] ?? p2;
    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C${cp1x.toFixed(1)} ${cp1y.toFixed(1)}, ${cp2x.toFixed(1)} ${cp2y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
  }
  return d;
}

// 드라이파우더 추정 로직을 누적 집행 곡선 + 공식으로 보여주는 hover 설명 창.
// 순수 CSS hover(그룹) 기반 — Radix 없이 동작(서버 컴포넌트).
export function DryPowderInfo() {
  const data = sampleAnnualDeployment(); // 표준 가정(존속 7년)
  const { termYears, investmentPeriodYears } = DRY_POWDER_ASSUMPTIONS;

  // SVG 좌표 (viewBox 기준)
  const W = 256;
  const H = 124;
  const PL = 8;
  const PR = 8;
  const PT = 8;
  const PB = 18;
  const iw = W - PL - PR;
  const ih = H - PT - PB;
  // 결성(0년차, 0%) + 연차별 누적집행률
  const cum = [
    { year: 0, value: 0 },
    ...data.map((d) => ({ year: d.year, value: d.cumulative })),
  ];
  const n = cum.length;
  const sx = (i: number) => PL + (n <= 1 ? 0 : (i / (n - 1)) * iw);
  const sy = (v: number) => PT + (1 - v) * ih; // v = 누적집행률(0~1)

  const points = cum.map((d, i) => ({ x: sx(i), y: sy(d.value) }));
  const line = smoothPath(points);
  // 소진(집행) 영역 = 곡선 아래
  const investedArea = `${line} L${sx(n - 1).toFixed(1)} ${sy(0).toFixed(1)} L${sx(0).toFixed(1)} ${sy(0).toFixed(1)} Z`;
  const ipIndex = investmentPeriodYears; // 투자기간 종료 연차 → 인덱스(0년차 포함)
  const ipValue = cum[ipIndex]?.value ?? 0; // 종료 시점 누적집행률

  return (
    <span className="group relative inline-flex">
      <button
        type="button"
        aria-label="드라이파우더 추정 로직 설명"
        className="inline-flex size-6 cursor-help items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        <Info className="size-4" />
      </button>

      <span
        role="tooltip"
        className="pointer-events-none absolute right-0 top-full z-50 mt-1.5 block w-80 origin-top-right scale-95 rounded-lg border border-border bg-popover p-3 text-left text-popover-foreground opacity-0 shadow-md transition-all duration-150 group-hover:scale-100 group-hover:opacity-100 group-focus-within:scale-100 group-focus-within:opacity-100"
      >
        <span className="block text-sm font-semibold">드라이파우더 추정 방식</span>
        <span className="mt-1 block text-xs text-muted-foreground">
          결성연도·만기만으로 누적 집행 페이싱을 추정합니다. 조합 편집에서 실제
          드라이파우더를 입력하면 추정 대신 실측값을 사용합니다.
        </span>

        {/* 누적 집행률 곡선 */}
        <span className="mt-2 block rounded-md border border-border bg-background/60 p-2">
          <svg
            viewBox={`0 0 ${W} ${H}`}
            className="w-full"
            role="img"
            aria-label="결성~만기 누적 집행률 곡선"
          >
            {/* 미소진(드라이파우더) 배경 */}
            <rect x={PL} y={PT} width={iw} height={ih} className="fill-emerald-500/10" />
            {/* 소진(집행) 영역 */}
            <path d={investedArea} className="fill-muted-foreground/20" />
            {/* 투자기간 종료 표시 */}
            <line
              x1={sx(ipIndex)}
              y1={PT}
              x2={sx(ipIndex)}
              y2={PT + ih}
              className="stroke-border"
              strokeDasharray="3 3"
              strokeWidth={1}
            />
            {/* 누적 집행 곡선 */}
            <path
              d={line}
              className="fill-none stroke-emerald-600 dark:stroke-emerald-400"
              strokeWidth={2}
              strokeLinejoin="round"
            />
            {/* 투자기간 종료 지점 강조 */}
            <circle
              cx={sx(ipIndex)}
              cy={sy(ipValue)}
              r={2.5}
              className="fill-emerald-600 dark:fill-emerald-400"
            />
            <text
              x={sx(ipIndex)}
              y={sy(ipValue) - 4}
              textAnchor="middle"
              className="fill-foreground text-[8px] font-medium"
            >
              {Math.round(ipValue * 100)}%
            </text>
            {/* X축 라벨(연차) */}
            {cum.map((d, i) => (
              <text
                key={d.year}
                x={sx(i)}
                y={H - 5}
                textAnchor="middle"
                className="fill-muted-foreground text-[8px]"
              >
                {d.year}
              </text>
            ))}
          </svg>
          <span className="mt-1 flex items-center justify-center gap-3 text-[10px] text-muted-foreground">
            <span className="flex items-center gap-1">
              <span className="inline-block size-2 rounded-sm bg-emerald-500/40" />
              미소진(드라이파우더)
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block size-2 rounded-sm bg-muted-foreground/30" />
              소진(추정)
            </span>
          </span>
          <span className="mt-0.5 block text-center text-[9px] text-muted-foreground">
            가로축 = 결성 후 연차 · 점선 = 투자기간 종료
          </span>
        </span>

        {/* 공식 */}
        <span className="mt-2 block space-y-1 text-[11px]">
          <span className="block font-medium">공식</span>
          <span className="block rounded bg-muted px-2 py-1 font-mono text-[10px] leading-relaxed">
            드라이파우더 = 결성총액 − 누적집행액
            <br />
            누적집행액 = 결성총액 × 집행률(경과시점)
          </span>
          <span className="ml-3 block list-disc space-y-0.5 text-muted-foreground">
            <span className="block">· 투자기간 = min(5, max(3, 존속−3)) — 최소 3년·최대 5년</span>
            <span className="block">· 초반 1년차 소진율은 10~15%에 그침 (천천히 시작)</span>
            <span className="block">· 투자기간 동안 0% → 약 92% 집행 (대부분 소진)</span>
            <span className="block">· 나머지 약 8%만 후속투자용으로 만기까지 천천히 소진</span>
            <span className="block">
              · 표준 가정: 존속 {termYears}년 · 투자기간 {investmentPeriodYears}년
            </span>
          </span>
        </span>
      </span>
    </span>
  );
}
