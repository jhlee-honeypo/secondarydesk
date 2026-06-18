"use client";

import { useState } from "react";
import { FileText } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { formatWon } from "@/lib/format";
import {
  computeMetrics,
  gradeHealth,
  HEALTH_LABEL,
  type HealthLevel,
} from "@/lib/financial-health";
import type { FinancialStatement } from "@/lib/types";

const HEALTH_VARIANT: Record<HealthLevel, "destructive" | "secondary" | "outline"> = {
  danger: "destructive",
  warning: "secondary",
  good: "outline",
};

const FIELDS: { key: keyof FinancialStatement; label: string }[] = [
  { key: "rev_curr", label: "매출(당기)" },
  { key: "ni_curr", label: "당기순이익(당기)" },
  { key: "rev_prev", label: "매출(전기)" },
  { key: "ni_prev", label: "당기순이익(전기)" },
  { key: "cash", label: "현금" },
  { key: "savings", label: "보통예금" },
  { key: "total_equity", label: "자본총계" },
  { key: "capital", label: "자본금" },
  { key: "sga", label: "판매관리비" },
];

// 크롬 PDF 뷰어 파라미터: 썸네일 패널 제거(navpanes=0) + 폭맞춤 확대(view=FitH)
const PDF_PARAMS = "#navpanes=0&view=FitH";
function viewerSrc(url: string): string {
  const base = /^https?:/i.test(url)
    ? `/api/financial-file?url=${encodeURIComponent(url)}`
    : url;
  return `${base}${PDF_PARAMS}`;
}
function fileLabel(url: string): string {
  try {
    return decodeURIComponent(url.split("/").pop() ?? url);
  } catch {
    return "원본";
  }
}
// PDF·이미지만 브라우저 임베드 가능(엑셀 등은 미지원 → 새 탭 안내)
function isEmbeddable(url: string): boolean {
  const path = url.split("?")[0].split("#")[0].toLowerCase();
  return path.startsWith("blob:") || /\.(pdf|png|jpe?g|gif|webp)$/.test(path);
}
function pct(v: number | null): string {
  return v === null ? "—" : `${(v * 100).toFixed(0)}%`;
}
const FUNDING_LABEL: Record<string, string> = {
  None: "없음",
  Done: "완료",
  Expected: "예정",
  Ongoing: "진행중",
};
function fundingLabel(v: string): string {
  return FUNDING_LABEL[v] ?? v;
}

// 보드 행 → 원본 PDF 좌우 분할 뷰어(왼쪽: 저장된 추출값 읽기전용 / 오른쪽: 원본 PDF)
export function BoardFileViewer({ fin }: { fin: FinancialStatement }) {
  const urls = (fin.source_file_url ?? "").split("\n").filter(Boolean);
  const [open, setOpen] = useState(false);
  const [activeUrl, setActiveUrl] = useState(urls[0] ?? "");

  if (urls.length === 0) return null;

  const metrics = computeMetrics(fin);
  const health = gradeHealth(fin, metrics);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-[10px] text-primary underline"
      >
        원본 보기
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="flex h-[94vh] w-[97vw] max-w-[1800px] flex-col">
          <DialogHeader>
            <DialogTitle>
              {fin.company_name} · {fin.report_year} {fin.report_month / 3}분기 — 원본 대조
            </DialogTitle>
          </DialogHeader>

          <div className="flex min-h-0 flex-1 gap-4">
            {/* 좌: 저장된 추출값(읽기 전용) — 좁게 두고 PDF 영역을 넓힌다 */}
            <div className="w-[320px] shrink-0 space-y-3 overflow-y-auto pr-1 text-sm">
              <div className="flex items-center gap-2">
                <Badge variant={HEALTH_VARIANT[health.level]}>
                  {HEALTH_LABEL[health.level]}
                </Badge>
                <span className="text-xs text-muted-foreground">
                  {health.reasons.join(", ")}
                </span>
              </div>

              <table className="w-full">
                <tbody>
                  {FIELDS.map((f) => (
                    <tr key={f.key} className="border-b last:border-0">
                      <td className="py-1 pr-2 text-muted-foreground">{f.label}</td>
                      <td className="py-1 text-right tabular-nums">
                        {formatWon(fin[f.key] as number)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="space-y-0.5 rounded-md bg-muted/40 p-2 text-xs text-muted-foreground">
                <div>보유현금 {formatWon(metrics.heldCash)}</div>
                <div>월평균매출 {formatWon(metrics.monthlyRevenue)}</div>
                <div>
                  런웨이{" "}
                  {metrics.runwayMonths === null
                    ? "흑자/충분"
                    : `${metrics.runwayMonths.toFixed(1)}개월`}
                </div>
                <div>자본잠식률 {pct(metrics.capitalErosion)}</div>
                <div>매출성장 {pct(metrics.revenueGrowth)}</div>
                <div>{metrics.isProfit ? "당기 흑자" : "당기 적자"}</div>
              </div>

              {(fin.funding_round ||
                typeof fin.head_count === "number" ||
                fin.business_highlight) && (
                <div className="space-y-1 rounded-md border p-2 text-xs">
                  <div className="flex flex-wrap gap-x-3 gap-y-0.5">
                    {fin.funding_round && (
                      <span>
                        투자유치 <b>{fundingLabel(fin.funding_round)}</b>
                        {fin.funding_series ? ` · ${fin.funding_series}` : ""}
                        {fin.total_raised
                          ? ` · 누적 ${formatWon(fin.total_raised)}`
                          : ""}
                      </span>
                    )}
                    {typeof fin.head_count === "number" && (
                      <span>
                        직원 <b>{fin.head_count}명</b>
                      </span>
                    )}
                  </div>
                  {fin.business_highlight && (
                    <p className="max-h-40 overflow-y-auto whitespace-pre-wrap text-muted-foreground">
                      {fin.business_highlight}
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* 우: 원본 PDF */}
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border bg-muted/20">
              {urls.length > 1 && (
                <div className="flex flex-wrap items-center gap-2 border-b p-2 text-[11px]">
                  {urls.map((u, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setActiveUrl(u)}
                      className={cn(
                        "inline-flex items-center gap-1 underline",
                        u === activeUrl
                          ? "font-semibold text-primary"
                          : "text-primary/80",
                      )}
                    >
                      <FileText className="size-3" />
                      {fileLabel(u)}
                    </button>
                  ))}
                </div>
              )}
              {activeUrl && isEmbeddable(activeUrl) ? (
                <iframe
                  key={activeUrl}
                  src={viewerSrc(activeUrl)}
                  title="원본 재무제표"
                  className="h-full w-full flex-1"
                />
              ) : activeUrl ? (
                <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center text-sm text-muted-foreground">
                  <p>엑셀 등은 미리보기를 지원하지 않습니다.</p>
                  <a
                    href={activeUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary underline"
                  >
                    새 탭에서 열기 / 다운로드
                  </a>
                </div>
              ) : (
                <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                  원본 파일이 없습니다.
                </div>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
