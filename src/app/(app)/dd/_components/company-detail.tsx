"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { AlertTriangle, ExternalLink, FolderOpen, Trash2, Upload } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { readableKind, unsupportedReason } from "@/lib/dd-file-kind";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

import {
  clearDecision,
  deleteFile,
  getFileUrl,
  registerFile,
  runCompleteness,
  setDecision,
  setFileCategory,
} from "../actions";
import { classifyAllFiles } from "./classify-loop";
import { collectDroppedFiles, collectPickedFiles } from "./folder-drop";
import {
  VERDICT_LABEL,
  effectiveCode,
  type DdCompany,
  type DdCriterion,
  type DdFile,
  type Verdict,
} from "../types";

const BUCKET = "dd-docs";

const STATUS_STYLE: Record<string, string> = {
  ok: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  missing: "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300",
  unreadable: "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300",
  stale: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  undated: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  uncertain: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300",
  na: "bg-muted text-muted-foreground",
};

const STATUS_LABEL: Record<string, string> = {
  ok: "충족",
  missing: "미제출",
  unreadable: "판독 불가",
  stale: "만료",
  undated: "발급일 미상",
  uncertain: "확인 필요",
  na: "해당 없음",
};

const LEVEL_STYLE: Record<string, string> = {
  high: "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300",
  medium: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  low: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300",
  none: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  unknown: "bg-muted text-muted-foreground",
};

const LEVEL_LABEL: Record<string, string> = {
  high: "높음",
  medium: "중간",
  low: "낮음",
  none: "없음",
  unknown: "확인 못함",
};

/** Storage 키용 — 한글·공백이 섞인 원본 파일명은 DB 에만 남기고 경로는 ASCII 로. */
function safeKey(fileName: string): string {
  const dot = fileName.lastIndexOf(".");
  const ext = dot > 0 ? fileName.slice(dot + 1).toLowerCase().replace(/[^a-z0-9]/g, "") : "";
  return ext ? `${crypto.randomUUID()}.${ext}` : crypto.randomUUID();
}

function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)}KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}

export function CompanyDetail({
  batchId,
  company,
  docCriteria,
  onClose,
}: {
  batchId: string;
  company: DdCompany;
  docCriteria: DdCriterion[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const folderRef = useRef<HTMLInputElement>(null);
  const [decisionReason, setDecisionReason] = useState(company.decision?.reason ?? "");
  const [busy, setBusy] = useState("");

  /** 분류 루프 — 업로드 직후 자동 실행되고, 버튼으로도 돌릴 수 있다. */
  const classify = async () => {
    setError("");
    const out = await classifyAllFiles(company.id, (p) => {
      setBusy(
        p.done === p.total
          ? "완결성 판정 중…"
          : `AI 분류 중 ${p.done + 1}/${p.total} — ${p.fileName}`,
      );
    });
    setBusy("");
    if (out.failures.length > 0) setError(out.failures.join(" / "));
    router.refresh();
    return out;
  };

  /**
   * 브라우저 → Storage 직접 업로드. 서버 액션은 메타 등록만 한다(본문 크기 제한
   * 회피 + 큰 스캔 PDF 를 서버 메모리로 통과시키지 않기 위해).
   * 업로드가 끝나면 **분류까지 이어서 돌린다** — 파일을 넣는 것과 분류는 사람 입장에서
   * 한 동작이고, 버튼을 따로 누르게 하면 '미분류'인 채로 방치된다.
   */
  const upload = async (files: File[]) => {
    setError("");
    if (files.length === 0) {
      setError("올릴 수 있는 파일을 찾지 못했습니다. 폴더가 비어 있는지 확인해 주세요.");
      return;
    }

    const supabase = createClient();
    const problems: string[] = [];
    let uploaded = 0;

    for (let i = 0; i < files.length; i += 1) {
      const file = files[i];
      setBusy(`업로드 중 ${i + 1}/${files.length} — ${file.name}`);

      const path = `${batchId}/${company.id}/${safeKey(file.name)}`;
      const { error: upError } = await supabase.storage
        .from(BUCKET)
        .upload(path, file, { contentType: file.type || undefined });
      if (upError) {
        problems.push(`${file.name}: ${upError.message}`);
        continue;
      }

      const res = await registerFile({
        companyId: company.id,
        storagePath: path,
        fileName: file.name,
        mimeType: file.type || "",
        byteSize: file.size,
      });
      if (!res.ok) problems.push(`${file.name}: ${res.error}`);
      else uploaded += 1;
    }

    setBusy("");
    if (problems.length > 0) setError(problems.join(" / "));
    if (uploaded > 0) await classify();
    else router.refresh();
  };

  const recategorize = (fileId: string, code: string) => {
    start(async () => {
      const res = await setFileCategory(fileId, code);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      // 분류가 바뀌면 완결성이 달라진다 — 사람이 버튼을 또 누르게 하지 않는다.
      await runCompleteness(company.id);
      router.refresh();
    });
  };

  const removeFile = (f: DdFile) => {
    if (!confirm(`'${f.fileName}' 을 삭제합니다.`)) return;
    start(async () => {
      const res = await deleteFile(f.id);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      await runCompleteness(company.id);
      router.refresh();
    });
  };

  const openFile = (fileId: string) => {
    start(async () => {
      const res = await getFileUrl(fileId);
      if (!res.ok) setError(res.error);
      else window.open(res.data, "_blank", "noopener");
    });
  };

  const decide = (verdict: Verdict) => {
    start(async () => {
      const res = await setDecision(company.id, verdict, decisionReason);
      if (!res.ok) setError(res.error);
      router.refresh();
    });
  };

  const undecide = () => {
    start(async () => {
      const res = await clearDecision(company.id);
      if (!res.ok) setError(res.error);
      setDecisionReason("");
      router.refresh();
    });
  };

  const mismatchIds = new Set(
    (company.completeness?.details.companyMismatches ?? []).map((m) => m.fileId),
  );

  // 판독 불가 파일은 분류 대상이 아니므로 미분류로 세지 않는다(영원히 안 줄어든다).
  const unclassifiedCount = company.files.filter(
    (f) => f.readable && f.classifiedAt === null,
  ).length;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle>{company.name}</DialogTitle>
          <DialogDescription>
            서류를 올리고, AI 분류가 틀렸으면 고치고, 판정 결과를 확인합니다.
          </DialogDescription>
        </DialogHeader>

        {error && (
          <Card className="border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
            {error}
          </Card>
        )}

        {/* ── 업로드 ───────────────────────────────────────────────────── */}
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            // ⚠️ DataTransfer 는 핸들러가 반환되면 무효화되므로 **동기로** 넘긴다.
            // collectDroppedFiles 가 내부에서 await 전에 entry 를 다 확보한다.
            const collected = collectDroppedFiles(e.dataTransfer);
            void collected.then(upload);
          }}
          className={cn(
            "rounded-lg border-2 border-dashed p-6 text-center text-sm transition-colors",
            dragging
              ? "border-primary bg-primary/5"
              : "border-border text-muted-foreground",
          )}
        >
          <Upload className="mx-auto mb-2 size-5" />
          {busy || "서류 폴더를 통째로 끌어다 놓으세요 (하위 폴더까지 읽습니다)"}
          {!busy && (
            <div className="mt-3 flex items-center justify-center gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => folderRef.current?.click()}
              >
                <FolderOpen className="size-4" />
                폴더 선택
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => inputRef.current?.click()}
              >
                파일 선택
              </Button>
            </div>
          )}
          <p className="mt-2 text-xs">
            올리면 AI 분류가 자동으로 이어집니다. PDF·이미지만 읽으며, 엑셀·한글
            파일은 올라가되 판독 불가로 표시되니 PDF 로 변환해 주세요.
          </p>
          {/* webkitdirectory 는 타입 정의에 없어 속성을 문자열로 넘긴다(표준 밖 속성). */}
          <input
            ref={folderRef}
            type="file"
            multiple
            hidden
            {...{ webkitdirectory: "", directory: "" }}
            onChange={(e) => {
              void upload(collectPickedFiles(e.target.files));
              e.target.value = "";
            }}
          />
          <input
            ref={inputRef}
            type="file"
            multiple
            hidden
            onChange={(e) => {
              void upload(collectPickedFiles(e.target.files));
              e.target.value = "";
            }}
          />
        </div>

        {/* ── 체크리스트 ───────────────────────────────────────────────── */}
        <section className="space-y-2">
          <h3 className="text-sm font-semibold">
            ① 서류 완결성
            {company.completeness && (
              <span className="ml-2 font-normal text-muted-foreground">
                필수 {company.completeness.details.requiredMet}/
                {company.completeness.details.requiredTotal} 충족 ·{" "}
                {VERDICT_LABEL[company.completeness.verdict]}
              </span>
            )}
          </h3>

          {company.completeness ? (
            <>
              <p className="text-sm text-muted-foreground">
                {company.completeness.summary}
              </p>
              <Card className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-sm">
                  <thead className="border-b bg-muted/50 text-xs text-muted-foreground">
                    <tr>
                      <th className="px-3 py-1.5 text-left font-medium">체크리스트</th>
                      <th className="px-3 py-1.5 text-left font-medium">상태</th>
                      <th className="px-3 py-1.5 text-left font-medium">비고</th>
                    </tr>
                  </thead>
                  <tbody>
                    {company.completeness.details.items.map((it) => (
                      <tr key={it.code} className="border-b last:border-0">
                        <td className="px-3 py-1.5">
                          {it.label}
                          {!it.required && (
                            <span className="ml-1.5 text-xs text-muted-foreground">
                              선택
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-1.5">
                          <Badge
                            variant="secondary"
                            className={cn("font-medium", STATUS_STYLE[it.status])}
                          >
                            {STATUS_LABEL[it.status] ?? it.status}
                          </Badge>
                        </td>
                        <td className="px-3 py-1.5 text-xs text-muted-foreground">
                          {it.reason}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              아직 판정하지 않았습니다. 목록에서 ① 분류·완결성을 실행하세요.
            </p>
          )}
        </section>

        {/* ── 파일 목록 ────────────────────────────────────────────────── */}
        <section className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold">
              업로드 파일 {company.files.length}건
              {unclassifiedCount > 0 && (
                <span className="ml-2 font-normal text-sky-700 dark:text-sky-400">
                  미분류 {unclassifiedCount}건
                </span>
              )}
            </h3>
            {company.files.length > 0 && (
              <Button
                size="sm"
                variant="outline"
                disabled={pending || busy !== ""}
                onClick={() => void classify()}
              >
                {unclassifiedCount > 0
                  ? `미분류 ${unclassifiedCount}건 분류`
                  : "완결성 다시 판정"}
              </Button>
            )}
          </div>
          {company.files.length === 0 ? (
            <p className="text-sm text-muted-foreground">아직 올린 파일이 없습니다.</p>
          ) : (
            <Card className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-sm">
                <thead className="border-b bg-muted/50 text-xs text-muted-foreground">
                  <tr>
                    <th className="px-3 py-1.5 text-left font-medium">파일</th>
                    <th className="px-3 py-1.5 text-left font-medium">분류</th>
                    <th className="px-3 py-1.5 text-left font-medium">발급일</th>
                    <th className="px-3 py-1.5 text-left font-medium">비고</th>
                    <th className="w-16" />
                  </tr>
                </thead>
                <tbody>
                  {company.files.map((f) => {
                    const code = effectiveCode(f);
                    const unsupported =
                      readableKind(f.mimeType, f.fileName) === "unsupported";
                    return (
                      <tr key={f.id} className="border-b last:border-0">
                        <td className="px-3 py-1.5">
                          <div className="flex items-center gap-1.5">
                            <span className="max-w-[220px] truncate" title={f.fileName}>
                              {f.fileName}
                            </span>
                            {mismatchIds.has(f.id) && (
                              <AlertTriangle
                                className="size-3.5 shrink-0 text-amber-600"
                                aria-label="문서상 회사명이 다릅니다"
                              />
                            )}
                          </div>
                          <span className="text-xs text-muted-foreground">
                            {fmtSize(f.byteSize)}
                            {f.docCompany && ` · 문서상 ${f.docCompany}`}
                          </span>
                        </td>

                        <td className="px-3 py-1.5">
                          {/* 네이티브 select — 체크리스트가 16+ 항목이라 Radix Select 보다
                              키보드로 빠르게 고를 수 있다. */}
                          <select
                            value={code ?? "__none__"}
                            disabled={pending || unsupported}
                            onChange={(e) =>
                              recategorize(
                                f.id,
                                e.target.value === "__none__" ? "" : e.target.value,
                              )
                            }
                            className="h-7 w-44 rounded border bg-background px-1.5 text-xs disabled:opacity-50"
                          >
                            <option value="__none__">
                              {f.classifiedAt ? "해당 없음" : "미분류"}
                            </option>
                            {docCriteria.map((c) => (
                              <option key={c.code} value={c.code}>
                                {c.label}
                              </option>
                            ))}
                          </select>
                          {f.overrideCode !== null ? (
                            <span className="ml-1.5 text-[11px] text-sky-700 dark:text-sky-400">
                              수정됨
                            </span>
                          ) : (
                            f.confidence === "low" && (
                              <span className="ml-1.5 text-[11px] text-amber-700 dark:text-amber-400">
                                신뢰도 낮음
                              </span>
                            )
                          )}
                        </td>

                        <td className="px-3 py-1.5 text-xs">
                          {f.issuedDate ?? "—"}
                          {f.asOfDate && f.asOfDate !== f.issuedDate && (
                            <span className="block text-muted-foreground">
                              기준 {f.asOfDate}
                            </span>
                          )}
                        </td>

                        <td className="px-3 py-1.5 text-xs text-muted-foreground">
                          {unsupported ? unsupportedReason(f.fileName) : f.classifyNote}
                        </td>

                        <td className="px-2 py-1.5">
                          <div className="flex gap-0.5">
                            <button
                              type="button"
                              onClick={() => openFile(f.id)}
                              disabled={pending}
                              title="원본 열기"
                              className="rounded p-1 text-muted-foreground hover:text-foreground"
                            >
                              <ExternalLink className="size-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => removeFile(f)}
                              disabled={pending}
                              title="삭제"
                              className="rounded p-1 text-muted-foreground hover:text-destructive"
                            >
                              <Trash2 className="size-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </Card>
          )}
        </section>

        {/* ── 리스크 판정 ──────────────────────────────────────────────── */}
        <section className="space-y-2">
          <h3 className="text-sm font-semibold">
            ② 리스크 판정
            {company.risk && (
              <span className="ml-2 font-normal text-muted-foreground">
                {VERDICT_LABEL[company.risk.verdict]} · {company.risk.model}
              </span>
            )}
          </h3>

          {company.risk ? (
            <>
              <Card className="bg-muted/40 p-3 text-sm leading-relaxed">
                {company.risk.summary}
              </Card>

              <Card className="overflow-x-auto">
                <table className="w-full min-w-[720px] text-sm">
                  <thead className="border-b bg-muted/50 text-xs text-muted-foreground">
                    <tr>
                      <th className="px-3 py-1.5 text-left font-medium">기준</th>
                      <th className="px-3 py-1.5 text-left font-medium">수준</th>
                      <th className="px-3 py-1.5 text-left font-medium">발견</th>
                      <th className="px-3 py-1.5 text-left font-medium">근거</th>
                    </tr>
                  </thead>
                  <tbody>
                    {company.risk.details.items.map((it) => (
                      <tr key={it.code} className="border-b last:border-0 align-top">
                        <td className="px-3 py-1.5 whitespace-nowrap">{it.label}</td>
                        <td className="px-3 py-1.5">
                          <Badge
                            variant="secondary"
                            className={cn("font-medium", LEVEL_STYLE[it.level])}
                          >
                            {LEVEL_LABEL[it.level] ?? it.level}
                          </Badge>
                        </td>
                        <td className="px-3 py-1.5">{it.finding}</td>
                        <td className="px-3 py-1.5 text-xs text-muted-foreground">
                          {it.evidence}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>

              {company.risk.details.followUps.length > 0 && (
                <div className="text-sm">
                  <p className="font-medium">추가로 받아야 할 자료</p>
                  <ul className="mt-1 list-disc space-y-0.5 pl-5 text-muted-foreground">
                    {company.risk.details.followUps.map((f, i) => (
                      <li key={i}>{f}</li>
                    ))}
                  </ul>
                </div>
              )}

              {company.risk.details.skipped.length > 0 && (
                <p className="text-xs text-amber-700 dark:text-amber-400">
                  ⚠ 판정에 넣지 못한 파일:{" "}
                  {company.risk.details.skipped
                    .map((s) => `${s.fileName}(${s.reason})`)
                    .join(" / ")}
                </p>
              )}
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              아직 판정하지 않았습니다. 완결성을 통과한 뒤 ② 리스크를 실행하세요.
            </p>
          )}
        </section>

        {/* ── 사람 확정 ────────────────────────────────────────────────── */}
        <section className="space-y-2 border-t pt-4">
          <h3 className="text-sm font-semibold">최종 판정 (사람 확정)</h3>
          <p className="text-xs text-muted-foreground">
            AI 판정은 초안입니다. 여기서 확정한 값이 목록의 최종 판정이 되며, AI 와
            다르게 정했다면 사유를 꼭 남겨 주세요 — 투심에서 그대로 읽힙니다.
          </p>

          {company.decision && (
            <p className="text-sm">
              현재 <strong>{VERDICT_LABEL[company.decision.verdict]}</strong> —{" "}
              {company.decision.updatedByName}
            </p>
          )}

          <Textarea
            rows={2}
            value={decisionReason}
            onChange={(e) => setDecisionReason(e.target.value)}
            placeholder="확정 사유 (AI 판정을 뒤집는 경우 특히 중요합니다)"
          />
          <div className="flex flex-wrap gap-2">
            <Button size="sm" disabled={pending} onClick={() => decide("pass")}>
              통과로 확정
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={pending}
              onClick={() => decide("hold")}
            >
              보류로 확정
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={pending}
              onClick={() => decide("fail")}
            >
              탈락으로 확정
            </Button>
            {company.decision && (
              <Button size="sm" variant="ghost" disabled={pending} onClick={undecide}>
                확정 해제
              </Button>
            )}
          </div>
        </section>
      </DialogContent>
    </Dialog>
  );
}
