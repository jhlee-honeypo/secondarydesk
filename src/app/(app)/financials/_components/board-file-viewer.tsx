"use client";

import { useState, useTransition } from "react";
import { FileText, Pencil } from "lucide-react";
import { useRouter } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { formatWon } from "@/lib/format";
import {
  computeMetrics,
  gradeHealth,
  HEALTH_LABEL,
  type HealthLevel,
} from "@/lib/financial-health";
import type { FinancialStatement } from "@/lib/types";
import { updateFinancial } from "../actions";

const HEALTH_VARIANT: Record<HealthLevel, "destructive" | "secondary" | "outline"> = {
  danger: "destructive",
  warning: "secondary",
  good: "outline",
};

/** 수정 가능한 숫자 열 — 순서·이름을 추출 검토 화면(financials-client)과 맞춘다.
 *  서버 화이트리스트는 actions.ts EDITABLE_COLUMNS 에 따로 있다. */
type EditableKey =
  | "rev_curr"
  | "ni_curr"
  | "rev_prev"
  | "ni_prev"
  | "cogs"
  | "operating_income"
  | "sga"
  | "cash"
  | "savings"
  | "current_assets"
  | "current_liabilities"
  | "total_assets"
  | "total_liabilities"
  | "total_equity"
  | "capital"
  | "retained_earnings";

// 당기·전기를 같은 항목끼리 붙여 원본과 눈으로 대조하기 쉽게 둔다.
const FIELDS: { key: EditableKey; label: string }[] = [
  { key: "rev_curr", label: "매출(당기)" },
  { key: "rev_prev", label: "매출(전기)" },
  { key: "ni_curr", label: "당기순이익(당기)" },
  { key: "ni_prev", label: "당기순이익(전기)" },
  { key: "cogs", label: "매출원가" },
  { key: "operating_income", label: "영업이익(손실)" },
  { key: "sga", label: "판매관리비" },
  { key: "cash", label: "현금" },
  { key: "savings", label: "보통예금" },
  { key: "current_assets", label: "유동자산" },
  { key: "current_liabilities", label: "유동부채" },
  { key: "total_assets", label: "자산총계" },
  { key: "total_liabilities", label: "부채총계" },
  { key: "total_equity", label: "자본총계" },
  { key: "capital", label: "자본금" },
  { key: "retained_earnings", label: "이익잉여금(결손금)" },
];

// 앞 9개 열은 DB NOT NULL(기본 0) 이고, Phase 1 확장 열은 미수집이면 null 이다.
// 지표 계산(computeMetrics)이 앞 9개를 number 로 요구하므로 타입에서 구분한다.
type CoreKey =
  | "rev_curr"
  | "ni_curr"
  | "rev_prev"
  | "ni_prev"
  | "cash"
  | "savings"
  | "total_equity"
  | "capital"
  | "sga";
type Values = Record<CoreKey, number> &
  Record<Exclude<EditableKey, CoreKey>, number | null>;

function readValues(fin: FinancialStatement): Values {
  return Object.fromEntries(FIELDS.map((f) => [f.key, fin[f.key] ?? null])) as Values;
}

// 수정 중에는 값을 '문자열'로 들고 있는다. 숫자로 두면 "-" 만 입력한 순간
// Number("-") = NaN → 0 으로 접혀 음수를 아예 타이핑할 수 없다.
type Draft = Record<EditableKey, string>;

// 입력칸 표기 — 미수집(null)은 빈 칸. 비운 칸은 저장 시 0(원래 null 이면 그대로 null).
function inputText(v: number | null): string {
  return v === null ? "" : v.toLocaleString("en-US");
}
function makeDraft(values: Values): Draft {
  return Object.fromEntries(FIELDS.map((f) => [f.key, inputText(values[f.key])])) as Draft;
}
// 숫자·쉼표·마이너스만 남긴다(입력 중간 상태는 그대로 보존).
function sanitize(s: string): string {
  return s.replace(/[^\d,-]/g, "");
}
function parseInput(s: string): number {
  return Number(s.replace(/,/g, "")) || 0;
}

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

// 보드 행 → 원본 PDF 좌우 분할 뷰어(왼쪽: 저장된 추출값 — 수정 가능 / 오른쪽: 원본 PDF)
export function BoardFileViewer({ fin }: { fin: FinancialStatement }) {
  const urls = (fin.source_file_url ?? "").split("\n").filter(Boolean);
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [activeUrl, setActiveUrl] = useState(urls[0] ?? "");

  // 저장된 값 — 수정 후에도 이 오버레이가 바로 새 값을 보여주도록 로컬에 둔다.
  const [values, setValues] = useState<Values>(() => readValues(fin));
  const [draft, setDraft] = useState<Draft | null>(null); // null = 읽기 모드
  const [error, setError] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();

  // 지표·건전성은 화면에 보이는 값(수정 반영본) 기준으로 다시 계산한다.
  const shown = { ...fin, ...values };
  const metrics = computeMetrics(shown);
  const health = gradeHealth(shown, metrics);

  function save() {
    if (!draft) return;
    // 실제로 바뀐 열만 보낸다 — 손대지 않은 미수집(null) 값이 0 으로 덮이지 않게.
    const patch: Record<string, number> = {};
    const next = { ...values } as Record<EditableKey, number | null>;
    for (const f of FIELDS) {
      const raw = draft[f.key];
      // 원래 값 없음(null) + 여전히 빈 칸 → 손대지 않은 것으로 본다.
      if (raw.trim() === "" && values[f.key] === null) continue;
      const n = parseInput(raw);
      if (n !== values[f.key]) {
        patch[f.key] = n;
        next[f.key] = n;
      }
    }
    if (Object.keys(patch).length === 0) {
      setDraft(null);
      return;
    }
    setError(null);
    startSaving(async () => {
      const res = await updateFinancial(fin.id, patch);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setValues(next as Values);
      setDraft(null);
      router.refresh(); // 뒤의 표(건전성 등급·월평균 등)를 새 값으로 다시 그린다
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          // 열 때마다 서버가 준 최신 값에서 읽기 모드로 시작한다.
          setValues(readValues(fin));
          setDraft(null);
          setError(null);
          setOpen(true);
        }}
        className="text-[10px] text-primary underline"
      >
        {urls.length > 0 ? "원본 보기" : "값 보기·수정"}
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="flex h-[94vh] w-[97vw] max-w-[1800px] flex-col">
          <DialogHeader>
            <DialogTitle>
              {fin.company_name} · {fin.report_year} {fin.report_month / 3}분기 — 원본 대조
            </DialogTitle>
          </DialogHeader>

          <div className="flex min-h-0 flex-1 gap-4">
            {/* 좌: 저장된 추출값 — '수정'을 누르면 원본을 보면서 바로 고칠 수 있다 */}
            <div className="w-[320px] shrink-0 space-y-3 overflow-y-auto pr-1 text-sm">
              <div className="flex items-center gap-2">
                <Badge variant={HEALTH_VARIANT[health.level]}>
                  {HEALTH_LABEL[health.level]}
                </Badge>
                <span className="text-xs text-muted-foreground">
                  {health.reasons.join(", ")}
                </span>
              </div>

              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-muted-foreground">
                  {draft ? "원본과 대조해 값을 고치세요" : "저장된 추출값"}
                </span>
                {draft ? (
                  <span className="flex gap-1">
                    <Button size="sm" className="h-7 px-2" onClick={save} disabled={saving}>
                      {saving ? "저장 중…" : "저장"}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 px-2"
                      onClick={() => {
                        setDraft(null);
                        setError(null);
                      }}
                      disabled={saving}
                    >
                      취소
                    </Button>
                  </span>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 px-2"
                    onClick={() => setDraft(makeDraft(values))}
                  >
                    <Pencil className="size-3" />
                    수정
                  </Button>
                )}
              </div>
              {error && <p className="text-xs text-rose-600">{error}</p>}

              <table className="w-full">
                <tbody>
                  {FIELDS.map((f) => (
                    <tr key={f.key} className="border-b last:border-0">
                      <td className="py-1 pr-2 text-muted-foreground">{f.label}</td>
                      <td className="py-1 text-right tabular-nums">
                        {draft ? (
                          <Input
                            className="h-7 text-right text-xs tabular-nums"
                            // number 로 두면 쉼표 표기가 막히고 마이너스 입력도 불편하다
                            inputMode="text"
                            value={draft[f.key]}
                            onChange={(e) =>
                              setDraft((d) =>
                                d ? { ...d, [f.key]: sanitize(e.target.value) } : d,
                              )
                            }
                            // 칸을 벗어날 때만 쉼표를 다시 붙인다(타이핑 중에는 방해 없음)
                            onBlur={() =>
                              setDraft((d) => {
                                if (!d) return d;
                                const raw = d[f.key];
                                return {
                                  ...d,
                                  [f.key]:
                                    raw.trim() === "" ? "" : inputText(parseInput(raw)),
                                };
                              })
                            }
                          />
                        ) : (
                          formatWon(values[f.key])
                        )}
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
