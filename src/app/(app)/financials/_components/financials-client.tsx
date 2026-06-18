"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Upload, Database, FileText } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { SearchableSelect, type ComboOption } from "@/components/app/searchable-select";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  computeMetrics,
  gradeHealth,
  HEALTH_LABEL,
  type HealthLevel,
} from "@/lib/financial-health";
import { formatWon } from "@/lib/format";
import {
  extractUploads,
  extractSlabBatch,
  listSlabReports,
  saveFinancials,
  type ReviewRow,
  type SlabReportItem,
} from "../actions";

const HEALTH_VARIANT: Record<HealthLevel, "destructive" | "secondary" | "outline"> = {
  danger: "destructive",
  warning: "secondary",
  good: "outline",
};

const SLAB_BATCH = 4; // 서버 액션 1회당 추출 건수(타임아웃 여유)

function firstUrl(rows: ReviewRow[]): string | null {
  for (const r of rows) if (r.source_file_urls[0]) return r.source_file_urls[0];
  return null;
}

// 숫자 입력 표시용 천단위 콤마(편집 시 patch 가 콤마를 제거하고 숫자로 파싱)
function withCommas(n: number): string {
  return Number.isFinite(n) ? n.toLocaleString("en-US") : "0";
}

// slab 투자유치여부 라벨(영문 원문 → 한글)
function fundingLabel(v: string): string {
  const m: Record<string, string> = {
    None: "없음",
    Done: "완료",
    Expected: "예정",
    Ongoing: "진행중",
  };
  return m[v] ?? v;
}

// 진행률 바 — value 가 숫자면 결정형(0~100%), null 이면 인디터미닛(흐르는 애니메이션)
function ProgressBar({ value }: { value: number | null }) {
  return (
    <div className="h-1.5 w-56 overflow-hidden rounded-full bg-muted">
      {value === null ? (
        <div className="h-full w-1/4 rounded-full bg-primary [animation:progress-indeterminate_1.1s_ease-in-out_infinite]" />
      ) : (
        <div
          className="h-full rounded-full bg-primary transition-all duration-300"
          style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
        />
      )}
    </div>
  );
}

// 임베드용 src — http(s)(slab CDN)는 same-origin 프록시 경유(크로스도메인·다운로드
// 강제 회피), blob:(업로드)는 이미 same-origin 이라 그대로 사용.
// 크롬 PDF 뷰어 파라미터로 썸네일 패널 제거 + 폭맞춤 확대(가독성).
function viewerSrc(url: string): string {
  const base = /^https?:/i.test(url)
    ? `/api/financial-file?url=${encodeURIComponent(url)}`
    : url;
  return `${base}#navpanes=0&view=FitH`;
}
// PDF·이미지만 브라우저 임베드 가능(엑셀 등은 미지원 → 새 탭 안내)
function isEmbeddable(url: string): boolean {
  const path = url.split("?")[0].split("#")[0].toLowerCase();
  return path.startsWith("blob:") || /\.(pdf|png|jpe?g|gif|webp)$/.test(path);
}

// 원본 링크 표시 라벨 — http URL 은 파일명, blob URL 은 업로드 파일명/기본값
function fileLabel(url: string, fallback?: string | null): string {
  if (url.startsWith("blob:")) return fallback || "원본 파일";
  try {
    return decodeURIComponent(url.split("/").pop() ?? url);
  } catch {
    return fallback || "원본";
  }
}

const NUM_FIELDS: { key: keyof ReviewRow; label: string }[] = [
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

export function FinancialsClient() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);

  const [busy, setBusy] = useState<string | null>(null);
  // slab 추출처럼 건수를 아는 작업은 결정형 진행률, 그 외(목록 로딩·업로드·저장)는 null=인디터미닛
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  // 검토 단계
  const [rows, setRows] = useState<ReviewRow[] | null>(null);
  const [activeUrl, setActiveUrl] = useState<string | null>(null); // 우측 PDF 패널

  const closeReview = () => {
    setRows(null);
    setActiveUrl(null);
  };

  // slab 선택 단계
  const [slabList, setSlabList] = useState<SlabReportItem[] | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set()); // SlabReportItem.key
  const [slabFilter, setSlabFilter] = useState("");
  const [quarterKey, setQuarterKey] = useState(""); // `${year}|${quarter}`
  const [fundFilter, setFundFilter] = useState(""); // "" = 전체

  // ---- 업로드 추출 ----------------------------------------------------------
  async function onFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setError(null);
    setBusy(`${files.length}개 파일 추출 중…`);
    const fd = new FormData();
    for (const f of Array.from(files)) fd.append("files", f);
    try {
      // 업로드 원본은 서버에 저장하지 않으므로, 검토 중 비교용으로 브라우저
      // object URL 을 만들어 행에 붙인다(파일명 기준 매칭).
      const urlByName = new Map<string, string>();
      for (const f of Array.from(files)) urlByName.set(f.name, URL.createObjectURL(f));
      const res = await extractUploads(fd);
      if (res.errors.length) setError(res.errors.join("\n"));
      const enriched = res.rows.map((r) =>
        r.source_file && urlByName.get(r.source_file)
          ? { ...r, source_file_urls: [urlByName.get(r.source_file)!] }
          : r,
      );
      setRows(enriched);
      setActiveUrl(firstUrl(enriched));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  // ---- slab 목록 열기 --------------------------------------------------------
  async function openSlab() {
    setError(null);
    setBusy("slab 목록 불러오는 중…");
    try {
      const list = await listSlabReports();
      setSlabList(list);
      // 기본: 최신 분기(목록은 최신순 정렬) 선택, 펀드 전체, 선택 비움
      setQuarterKey(list[0] ? `${list[0].year}|${list[0].quarter}` : "");
      setFundFilter("");
      setPicked(new Set());
      setSlabFilter("");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  // ---- slab 일괄 추출(소량 배치 반복) ---------------------------------------
  async function runSlab() {
    const ids = [...picked];
    if (ids.length === 0) return;
    setError(null);
    const collected: ReviewRow[] = [];
    const errs: string[] = [];
    setProgress({ done: 0, total: ids.length });
    for (let i = 0; i < ids.length; i += SLAB_BATCH) {
      const chunk = ids.slice(i, i + SLAB_BATCH);
      const done = Math.min(i + chunk.length, ids.length);
      setBusy(`slab 추출 중 ${done}/${ids.length}`);
      try {
        const res = await extractSlabBatch(chunk);
        collected.push(...res.rows);
        errs.push(...res.errors);
      } catch (err) {
        errs.push(err instanceof Error ? err.message : String(err));
      }
      setProgress({ done, total: ids.length });
    }
    setBusy(null);
    setProgress(null);
    setSlabList(null);
    if (errs.length) setError(errs.join("\n"));
    setRows(collected);
    setActiveUrl(firstUrl(collected));
  }

  // ---- 검토 표 편집 ----------------------------------------------------------
  function patch(key: string, field: keyof ReviewRow, value: string) {
    setRows((prev) =>
      (prev ?? []).map((r) => {
        if (r.key !== key) return r;
        if (field === "company_name" || field === "company_name_en")
          return { ...r, [field]: value };
        const n = Number(value.replace(/,/g, "")) || 0;
        return { ...r, [field]: n };
      }),
    );
  }

  async function save() {
    if (!rows) return;
    setBusy("저장 중…");
    setError(null);
    const res = await saveFinancials(rows);
    setBusy(null);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    closeReview();
    router.refresh();
  }

  const slabItems = slabList ?? [];

  // 분기 옵션(최신순) — 목록이 이미 최신순이라 등장 순서 유지
  const quarterOptions: ComboOption[] = [];
  {
    const seen = new Set<string>();
    for (const x of slabItems) {
      const k = `${x.year}|${x.quarter}`;
      if (!seen.has(k)) {
        seen.add(k);
        quarterOptions.push({ value: k, label: `${x.year} ${x.quarter}` });
      }
    }
  }

  // 펀드(조합) 옵션 — 전체 + 등장 조합명 가나다순
  const fundNamesSet = new Set<string>();
  for (const x of slabItems) for (const f of x.fundNames) fundNamesSet.add(f);
  const fundOptions: ComboOption[] = [
    { value: "", label: "전체 조합" },
    ...[...fundNamesSet]
      .sort((a, b) => a.localeCompare(b, "ko"))
      .map((f) => ({ value: f, label: f })),
  ];

  const slabFiltered = slabItems
    .filter(
      (x) =>
        `${x.year}|${x.quarter}` === quarterKey &&
        (fundFilter === "" || x.fundNames.includes(fundFilter)) &&
        (!slabFilter ||
          x.nameKr.includes(slabFilter) ||
          (x.nameEn ?? "").toLowerCase().includes(slabFilter.toLowerCase())),
    )
    // 제출(파일 O) 먼저 → 미제출은 하단, 각 그룹 내 회사명순
    .sort(
      (a, b) =>
        Number(b.hasFile) - Number(a.hasFile) ||
        a.nameKr.localeCompare(b.nameKr, "ko"),
    );

  const submittedCount = slabFiltered.filter((x) => x.hasFile).length;
  const savedCount = slabFiltered.filter((x) => x.hasFile && x.alreadySaved).length;
  const missingCount = slabFiltered.length - submittedCount;

  // 전체선택은 제출분 중 "미저장"만 — 이미 저장된 기업 재추출(비용) 방지.
  // (개별 재추출이 필요하면 해당 회사 체크박스를 직접 누르면 됨)
  const selectFiltered = () =>
    setPicked((prev) => {
      const next = new Set(prev);
      slabFiltered.forEach(
        (x) => x.hasFile && !x.alreadySaved && next.add(x.key),
      );
      return next;
    });
  const deselectFiltered = () =>
    setPicked((prev) => {
      const next = new Set(prev);
      slabFiltered.forEach((x) => next.delete(x.key));
      return next;
    });

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex gap-2">
        <input
          ref={fileRef}
          type="file"
          accept="application/pdf,image/png,image/jpeg,image/gif,image/webp"
          multiple
          className="hidden"
          onChange={onFiles}
        />
        <Button
          variant="outline"
          onClick={() => fileRef.current?.click()}
          disabled={!!busy}
        >
          <Upload />
          파일 업로드
        </Button>
        <Button onClick={openSlab} disabled={!!busy}>
          <Database />
          slab에서 가져오기
        </Button>
      </div>
      {busy && (
        <div className="flex flex-col items-end gap-1">
          <span className="text-xs text-muted-foreground">{busy}</span>
          <ProgressBar
            value={progress ? (progress.done / progress.total) * 100 : null}
          />
        </div>
      )}
      {error && (
        <span className="max-w-md text-right text-xs whitespace-pre-wrap text-rose-600">
          {error}
        </span>
      )}

      {/* slab 회사 선택 */}
      <Dialog open={!!slabList} onOpenChange={(o) => !o && setSlabList(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>slab 재무제표 가져오기</DialogTitle>
          </DialogHeader>

          {/* 조합 · 분기 필터 */}
          <div className="flex flex-wrap items-center gap-2">
            <SearchableSelect
              value={fundFilter}
              onValueChange={setFundFilter}
              options={fundOptions}
              placeholder="조합"
              searchPlaceholder="조합 검색"
              ariaLabel="조합"
              triggerClassName="w-56"
              portal={false}
            />
            <SearchableSelect
              value={quarterKey}
              onValueChange={setQuarterKey}
              options={quarterOptions}
              placeholder="분기 선택"
              searchPlaceholder="분기 검색"
              ariaLabel="분기"
              triggerClassName="w-40"
              portal={false}
            />
            <Input
              placeholder="회사명 검색"
              value={slabFilter}
              onChange={(e) => setSlabFilter(e.target.value)}
              className="h-9 flex-1"
            />
          </div>

          {/* 전체선택/해제 */}
          <div className="flex items-center gap-2 text-xs">
            <Button variant="outline" size="sm" onClick={selectFiltered}>
              전체 선택(미저장)
            </Button>
            <Button variant="outline" size="sm" onClick={deselectFiltered}>
              전체 해제
            </Button>
            <span className="text-muted-foreground">
              제출 {submittedCount}(저장 {savedCount}) · 미제출 {missingCount} · 선택{" "}
              {picked.size}
            </span>
          </div>

          <div className="max-h-80 space-y-1 overflow-y-auto pr-1">
            {slabFiltered.map((x) =>
              x.hasFile ? (
                <label
                  key={x.key}
                  className="flex items-center gap-2 rounded px-1 py-1 text-sm hover:bg-muted/50"
                >
                  <Checkbox
                    checked={picked.has(x.key)}
                    onCheckedChange={(c) =>
                      setPicked((prev) => {
                        const next = new Set(prev);
                        if (c) next.add(x.key);
                        else next.delete(x.key);
                        return next;
                      })
                    }
                  />
                  <span className="flex-1">
                    {x.nameKr}
                    {x.fundNames.length > 0 && (
                      <span className="ml-1 text-xs text-muted-foreground">
                        {x.fundNames.join(", ")}
                      </span>
                    )}
                  </span>
                  {x.alreadySaved && (
                    <Badge variant="outline" className="text-[10px]">
                      저장됨
                    </Badge>
                  )}
                </label>
              ) : (
                // 미제출 — 회색·비활성(선택 불가), 누가 안 냈는지 파악용
                <div
                  key={x.key}
                  className="flex cursor-not-allowed items-center gap-2 rounded px-1 py-1 text-sm text-muted-foreground/60 select-none"
                  title="재무제표 미제출"
                >
                  <Checkbox checked={false} disabled />
                  <span className="flex-1 line-through decoration-muted-foreground/40">
                    {x.nameKr}
                    {x.fundNames.length > 0 && (
                      <span className="ml-1 text-xs">{x.fundNames.join(", ")}</span>
                    )}
                  </span>
                  <Badge variant="secondary" className="text-[10px]">
                    미제출
                  </Badge>
                </div>
              ),
            )}
            {slabFiltered.length === 0 && (
              <p className="py-4 text-center text-sm text-muted-foreground">
                이 분기·조합에 보고한 회사가 없습니다.
              </p>
            )}
          </div>

          <DialogFooter>
            <span className="mr-auto text-xs text-muted-foreground">
              {picked.size}곳 선택 (배치당 {SLAB_BATCH}건 추출)
            </span>
            <Button variant="outline" onClick={() => setSlabList(null)}>
              취소
            </Button>
            <Button onClick={runSlab} disabled={picked.size === 0}>
              추출 {picked.size}건
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 검토·수정 — 좌: 편집 / 우: 원본 PDF */}
      <Dialog open={!!rows} onOpenChange={(o) => !o && closeReview()}>
        <DialogContent className="flex h-[94vh] w-[97vw] max-w-[1800px] flex-col">
          <DialogHeader>
            <DialogTitle>추출 결과 검토·수정 ({rows?.length ?? 0}건)</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground">
            왼쪽에서 값을 확인·수정하고, 카드의 &lsquo;원본 보기&rsquo;를 누르면 오른쪽에
            원본 PDF가 표시됩니다. 회사명이 비어있거나 unknown인 행은 저장되지 않습니다.
          </p>

          <div className="flex min-h-0 flex-1 gap-4">
            {/* 좌: 편집 카드 — 폭 고정, PDF 영역을 넓힌다 */}
            <div className="w-[440px] shrink-0 space-y-3 overflow-y-auto pr-1">
              {(rows ?? []).map((r) => {
                const metrics = computeMetrics(r);
                const health = gradeHealth(r, metrics);
                const isActive =
                  !!activeUrl && r.source_file_urls.includes(activeUrl);
                return (
                  <div
                    key={r.key}
                    className={cn(
                      "rounded-lg border p-3",
                      isActive && "ring-2 ring-primary/40",
                    )}
                  >
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <Input
                        className="h-8 w-40"
                        placeholder="회사명"
                        value={r.company_name}
                        onChange={(e) => patch(r.key, "company_name", e.target.value)}
                      />
                      <Input
                        className="h-8 w-20"
                        inputMode="numeric"
                        value={r.report_year}
                        onChange={(e) => patch(r.key, "report_year", e.target.value)}
                      />
                      <span className="text-xs text-muted-foreground">년</span>
                      <Input
                        className="h-8 w-16"
                        inputMode="numeric"
                        value={r.report_month}
                        onChange={(e) => patch(r.key, "report_month", e.target.value)}
                      />
                      <span className="text-xs text-muted-foreground">월</span>
                      <Badge
                        variant={HEALTH_VARIANT[health.level]}
                        className="ml-auto"
                      >
                        {HEALTH_LABEL[health.level]}
                      </Badge>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      {NUM_FIELDS.map((f) => (
                        <label key={f.key} className="text-xs">
                          <span className="text-muted-foreground">{f.label}</span>
                          <Input
                            className="h-8"
                            inputMode="numeric"
                            value={withCommas(r[f.key] as number)}
                            onChange={(e) => patch(r.key, f.key, e.target.value)}
                          />
                        </label>
                      ))}
                    </div>
                    <div className="mt-2 text-[11px] text-muted-foreground">
                      런웨이 {metrics.runwayMonths === null ? "흑자/충분" : metrics.runwayMonths.toFixed(1) + "개월"} ·
                      보유현금 {formatWon(metrics.heldCash)} ·
                      {health.reasons.join(", ")}
                      {r.slab_cash !== null && (
                        <span className="ml-1">
                          (slab 기입: 현금 {formatWon(r.slab_cash)}
                          {r.slab_runway !== null ? ` · 런웨이 ${r.slab_runway}개월` : ""})
                        </span>
                      )}
                    </div>
                    {r.source === "slab" &&
                      (r.slab_funding ||
                        r.slab_head_count !== null ||
                        r.slab_highlight) && (
                        <div className="mt-2 space-y-1 rounded-md bg-muted/40 p-2 text-[11px]">
                          <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-muted-foreground">
                            {r.slab_funding && (
                              <span>
                                투자유치{" "}
                                <b className="text-foreground">
                                  {fundingLabel(r.slab_funding)}
                                </b>
                                {r.slab_funding_series
                                  ? ` · ${r.slab_funding_series}`
                                  : ""}
                                {r.slab_total_raised
                                  ? ` · 누적 ${formatWon(r.slab_total_raised)}`
                                  : ""}
                              </span>
                            )}
                            {r.slab_head_count !== null && (
                              <span>
                                직원{" "}
                                <b className="text-foreground">
                                  {r.slab_head_count}명
                                </b>
                              </span>
                            )}
                          </div>
                          {r.slab_highlight && (
                            <p className="max-h-28 overflow-y-auto whitespace-pre-wrap text-muted-foreground">
                              {r.slab_highlight}
                            </p>
                          )}
                        </div>
                      )}
                    {r.source_file_urls.length > 0 && (
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px]">
                        <span className="text-muted-foreground">원본 보기:</span>
                        {r.source_file_urls.map((u, i) => (
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
                            {fileLabel(u, r.source_file)}
                          </button>
                        ))}
                        <a
                          href={r.source_file_urls[0]}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-muted-foreground underline"
                          title="새 탭에서 열기"
                        >
                          ↗ 새 탭
                        </a>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* 우: 원본 PDF 임베드 */}
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border bg-muted/20">
              {activeUrl && isEmbeddable(activeUrl) ? (
                <iframe
                  key={activeUrl}
                  src={viewerSrc(activeUrl)}
                  title="원본 재무제표"
                  className="h-full w-full"
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
                <div className="flex h-full items-center justify-center p-6 text-center text-sm text-muted-foreground">
                  카드의 &lsquo;원본 보기&rsquo;를 누르면 원본 PDF가 여기에 표시됩니다.
                </div>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={closeReview} disabled={!!busy}>
              취소
            </Button>
            <Button onClick={save} disabled={!!busy || !rows?.length}>
              {busy ? "저장 중…" : "저장"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
