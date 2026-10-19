"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { FileStack, Play, Plus, Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

import { addCompanies, deleteCompany, runRisk } from "../actions";
import { classifyAllFiles } from "./classify-loop";
import {
  VERDICT_LABEL,
  effectiveCode,
  finalVerdict,
  type DdBatchData,
  type DdCompany,
  type Verdict,
} from "../types";
import { CompanyDetail } from "./company-detail";
import { CriteriaEditor } from "./criteria-editor";

const VERDICT_STYLE: Record<Verdict, string> = {
  pass: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  hold: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  fail: "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300",
};

function VerdictBadge({ v }: { v: Verdict | null }) {
  if (!v) return <span className="text-xs text-muted-foreground">—</span>;
  return (
    <Badge variant="secondary" className={cn("font-medium", VERDICT_STYLE[v])}>
      {VERDICT_LABEL[v]}
    </Badge>
  );
}

export function DdBoard({ data }: { data: DdBatchData }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [openId, setOpenId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [names, setNames] = useState("");
  const [error, setError] = useState("");
  // 기업별 실행 진행 상태 — 20개사 이하라 전역 스피너보다 행 단위가 읽기 쉽다.
  const [busy, setBusy] = useState<Record<string, string>>({});

  const requiredTotal = useMemo(
    () => data.docCriteria.filter((c) => c.required).length,
    [data.docCriteria],
  );

  const openCompany = data.companies.find((c) => c.id === openId) ?? null;

  const counts = useMemo(() => {
    const out: Record<Verdict | "none", number> = {
      pass: 0,
      hold: 0,
      fail: 0,
      none: 0,
    };
    for (const c of data.companies) {
      const { verdict } = finalVerdict(c);
      out[verdict ?? "none"] += 1;
    }
    return out;
  }, [data.companies]);

  const submitNames = () => {
    setError("");
    start(async () => {
      const res = await addCompanies(data.batch.id, names);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setNames("");
      setAdding(false);
      router.refresh();
    });
  };

  const classify = async (c: DdCompany) => {
    setError("");
    const out = await classifyAllFiles(c.id, (p) => {
      setBusy((b) => ({
        ...b,
        [c.id]:
          p.done === p.total ? "완결성 판정 중…" : `분류 중 ${p.done + 1}/${p.total}`,
      }));
    });
    setBusy((b) => {
      const next = { ...b };
      delete next[c.id];
      return next;
    });
    if (out.failures.length > 0)
      setError(`${c.name} — 일부 실패: ${out.failures.join(" / ")}`);
    router.refresh();
  };

  const risk = (c: DdCompany) => {
    setError("");
    setBusy((b) => ({ ...b, [c.id]: "리스크 판정 중…" }));
    start(async () => {
      const res = await runRisk(c.id);
      setBusy((b) => {
        const next = { ...b };
        delete next[c.id];
        return next;
      });
      if (!res.ok) setError(`${c.name}: ${res.error}`);
      else if (res.data.skipped.length > 0)
        setError(
          `${c.name} — 판정에서 빠진 파일: ${res.data.skipped
            .map((s) => `${s.fileName}(${s.reason})`)
            .join(" / ")}`,
        );
      router.refresh();
    });
  };

  const remove = (c: DdCompany) => {
    if (!confirm(`'${c.name}' 을 삭제합니다. 업로드한 서류도 함께 지워집니다.`)) return;
    start(async () => {
      const res = await deleteCompany(c.id);
      if (!res.ok) setError(res.error);
      router.refresh();
    });
  };

  return (
    <Tabs defaultValue="companies" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <TabsList>
          <TabsTrigger value="companies">
            기업 {data.companies.length}
          </TabsTrigger>
          <TabsTrigger value="criteria">
            평가 기준 {data.docCriteria.length + data.riskCriteria.length}
          </TabsTrigger>
        </TabsList>

        <div className="flex items-center gap-3 text-sm">
          <span className="text-emerald-700 dark:text-emerald-400">
            통과 {counts.pass}
          </span>
          <span className="text-amber-700 dark:text-amber-400">보류 {counts.hold}</span>
          <span className="text-rose-700 dark:text-rose-400">탈락 {counts.fail}</span>
          <span className="text-muted-foreground">미판정 {counts.none}</span>
        </div>
      </div>

      <TabsContent value="companies" className="space-y-3">
        <div className="flex items-center gap-2">
          {adding ? (
            <Card className="w-full space-y-2 p-3">
              <Textarea
                autoFocus
                rows={5}
                value={names}
                onChange={(e) => setNames(e.target.value)}
                placeholder={"기업명을 줄바꿈이나 쉼표로 구분해 붙여넣으세요.\n예)\n㈜스파크랩\n주식회사 어쩌구\n…"}
              />
              <div className="flex gap-2">
                <Button size="sm" onClick={submitNames} disabled={pending}>
                  등록
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setAdding(false)}>
                  취소
                </Button>
              </div>
            </Card>
          ) : (
            <Button size="sm" variant="outline" onClick={() => setAdding(true)}>
              <Plus className="size-4" />
              기업 추가
            </Button>
          )}
        </div>

        {error && (
          <Card className="border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
            {error}
          </Card>
        )}

        {data.companies.length === 0 ? (
          <Card className="p-10 text-center text-sm text-muted-foreground">
            기업을 추가하고, 기업 행을 열어 서류 폴더를 통째로 끌어다 놓으세요.
          </Card>
        ) : (
          <Card className="overflow-x-auto">
            <table className="w-full min-w-[920px] text-sm">
              <thead className="border-b bg-muted/50 text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">기업</th>
                  <th className="px-3 py-2 text-left font-medium">서류</th>
                  <th className="px-3 py-2 text-left font-medium">① 완결성</th>
                  <th className="px-3 py-2 text-left font-medium">② 리스크</th>
                  <th className="px-3 py-2 text-left font-medium">최종</th>
                  <th className="px-3 py-2 text-left font-medium">실행</th>
                  <th className="w-8" />
                </tr>
              </thead>
              <tbody>
                {data.companies.map((c) => {
                  const final = finalVerdict(c);
                  const unclassified = c.files.filter(
                    (f) => effectiveCode(f) === null,
                  ).length;
                  const met = c.completeness?.details.requiredMet ?? 0;
                  const busyLabel = busy[c.id];

                  return (
                    <tr
                      key={c.id}
                      className="border-b last:border-0 hover:bg-muted/30"
                    >
                      <td className="px-3 py-2">
                        <button
                          type="button"
                          onClick={() => setOpenId(c.id)}
                          className="font-medium hover:underline"
                        >
                          {c.name}
                        </button>
                        {c.decision && (
                          <span className="ml-2 text-xs text-muted-foreground">
                            {c.decision.updatedByName} 확정
                          </span>
                        )}
                      </td>

                      <td className="px-3 py-2">
                        <button
                          type="button"
                          onClick={() => setOpenId(c.id)}
                          className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground"
                        >
                          <FileStack className="size-3.5" />
                          {c.files.length}건
                          {c.completeness && (
                            <span className="text-xs">
                              (필수 {met}/{requiredTotal})
                            </span>
                          )}
                          {unclassified > 0 && (
                            <Badge
                              variant="secondary"
                              className="bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300"
                            >
                              미분류 {unclassified}
                            </Badge>
                          )}
                        </button>
                      </td>

                      <td className="px-3 py-2">
                        <VerdictBadge v={c.completeness?.verdict ?? null} />
                      </td>
                      <td className="px-3 py-2">
                        <VerdictBadge v={c.risk?.verdict ?? null} />
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-1.5">
                          <VerdictBadge v={final.verdict} />
                          {final.source && (
                            <span className="text-[11px] text-muted-foreground">
                              {final.source}
                            </span>
                          )}
                        </div>
                      </td>

                      <td className="px-3 py-2">
                        {busyLabel ? (
                          <span className="text-xs text-muted-foreground">
                            {busyLabel}
                          </span>
                        ) : (
                          <div className="flex gap-1">
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={pending || c.files.length === 0}
                              onClick={() => void classify(c)}
                              title="미분류 서류를 AI 로 분류하고 완결성을 다시 셉니다"
                            >
                              ① 분류·완결성
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={
                                pending ||
                                !c.completeness ||
                                c.completeness.verdict === "fail"
                              }
                              onClick={() => risk(c)}
                              title={
                                !c.completeness
                                  ? "먼저 ①을 실행하세요"
                                  : c.completeness.verdict === "fail"
                                    ? "필수 서류가 미비해 실행할 수 없습니다"
                                    : "서류 내용에서 투자 걸림돌을 찾습니다"
                              }
                            >
                              <Play className="size-3.5" />② 리스크
                            </Button>
                          </div>
                        )}
                      </td>

                      <td className="px-2 py-2">
                        <button
                          type="button"
                          onClick={() => remove(c)}
                          disabled={pending}
                          title="기업 삭제"
                          className="rounded p-1 text-muted-foreground hover:text-destructive"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>
        )}
      </TabsContent>

      <TabsContent value="criteria">
        <CriteriaEditor
          batchId={data.batch.id}
          docCriteria={data.docCriteria}
          riskCriteria={data.riskCriteria}
        />
      </TabsContent>

      {openCompany && (
        <CompanyDetail
          key={openCompany.id}
          batchId={data.batch.id}
          company={openCompany}
          docCriteria={data.docCriteria}
          onClose={() => setOpenId(null)}
        />
      )}
    </Tabs>
  );
}
