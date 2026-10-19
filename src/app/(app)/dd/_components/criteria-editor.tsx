"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

import { addCriterion, deleteCriterion, updateCriterion } from "../actions";
import type { DdCriterion } from "../types";

/**
 * 배치별 평가 기준 편집. 여기서 고친 값은 **이 배치에만** 적용된다
 * (기준은 배치 생성 시 복사된 사본 — 지난 배치의 판정 근거가 소급 변경되지
 * 않게 하기 위해서다).
 *
 * 저장은 onBlur 에 건다 — 항목이 25개라 저장 버튼을 두면 어느 줄을 고쳤는지
 * 놓치기 쉽고, 기준 수정 직후 판정을 다시 돌리는 게 자연스러운 흐름이다.
 */
export function CriteriaEditor({
  batchId,
  docCriteria,
  riskCriteria,
}: {
  batchId: string;
  docCriteria: DdCriterion[];
  riskCriteria: DdCriterion[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState("");
  const [adding, setAdding] = useState<"doc" | "risk" | null>(null);
  const [newLabel, setNewLabel] = useState("");
  const [newGuidance, setNewGuidance] = useState("");

  const patch = (id: string, p: Parameters<typeof updateCriterion>[1]) => {
    start(async () => {
      const res = await updateCriterion(id, p);
      if (!res.ok) setError(res.error);
      router.refresh();
    });
  };

  const remove = (c: DdCriterion) => {
    if (!confirm(`'${c.label}' 기준을 삭제합니다. 이 배치에서만 사라집니다.`)) return;
    start(async () => {
      const res = await deleteCriterion(c.id);
      if (!res.ok) setError(res.error);
      router.refresh();
    });
  };

  const submitNew = (kind: "doc" | "risk") => {
    start(async () => {
      const res = await addCriterion({
        batchId,
        kind,
        label: newLabel,
        guidance: newGuidance,
        required: true,
        maxAgeDays: 0,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setNewLabel("");
      setNewGuidance("");
      setAdding(null);
      router.refresh();
    });
  };

  const addForm = (kind: "doc" | "risk") =>
    adding === kind ? (
      <Card className="space-y-2 p-3">
        <Input
          autoFocus
          value={newLabel}
          onChange={(e) => setNewLabel(e.target.value)}
          placeholder="항목명"
        />
        <Textarea
          rows={2}
          value={newGuidance}
          onChange={(e) => setNewGuidance(e.target.value)}
          placeholder={
            kind === "doc"
              ? "AI 가 이 서류를 알아보도록 돕는 설명 — 동의어·발급기관·표제"
              : "무엇을 걸림돌로 볼지 판정 가이드"
          }
        />
        <div className="flex gap-2">
          <Button size="sm" onClick={() => submitNew(kind)} disabled={pending}>
            추가
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setAdding(null)}>
            취소
          </Button>
        </div>
      </Card>
    ) : (
      <Button size="sm" variant="outline" onClick={() => setAdding(kind)}>
        <Plus className="size-4" />
        항목 추가
      </Button>
    );

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        기준은 이 배치의 사본입니다. 여기서 고쳐도 다른 배치와 기본값은 바뀌지
        않습니다. 기준을 바꾼 뒤에는 해당 기업의 판정을 다시 실행하세요.
      </p>

      {error && (
        <Card className="border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
          {error}
        </Card>
      )}

      {/* ── 서류 체크리스트 ──────────────────────────────────────────── */}
      <section className="space-y-2">
        <h3 className="text-sm font-semibold">
          서류 체크리스트 ({docCriteria.length}) — 1단계 완결성 판정에 쓰입니다
        </h3>
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-sm">
            <thead className="border-b bg-muted/50 text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-1.5 text-left font-medium">항목명</th>
                <th className="px-3 py-1.5 text-left font-medium">
                  AI 분류 설명
                </th>
                <th className="px-3 py-1.5 text-left font-medium">필수</th>
                <th className="px-3 py-1.5 text-left font-medium" title="발급 후 이 일수가 지나면 만료로 봅니다. 0 = 신선도 무관">
                  유효기간(일)
                </th>
                <th className="w-8" />
              </tr>
            </thead>
            <tbody>
              {docCriteria.map((c) => (
                <tr key={c.id} className="border-b last:border-0 align-top">
                  <td className="px-3 py-1.5">
                    <Input
                      defaultValue={c.label}
                      onBlur={(e) => {
                        if (e.target.value !== c.label)
                          patch(c.id, { label: e.target.value });
                      }}
                      className="h-8 w-48"
                    />
                  </td>
                  <td className="px-3 py-1.5">
                    <Textarea
                      defaultValue={c.guidance}
                      rows={2}
                      onBlur={(e) => {
                        if (e.target.value !== c.guidance)
                          patch(c.id, { guidance: e.target.value });
                      }}
                      className="min-w-[320px] text-xs"
                    />
                  </td>
                  <td className="px-3 py-1.5">
                    <Checkbox
                      checked={c.required}
                      onCheckedChange={(v) => patch(c.id, { required: v === true })}
                    />
                  </td>
                  <td className="px-3 py-1.5">
                    <Input
                      type="number"
                      min={0}
                      defaultValue={c.maxAgeDays}
                      onBlur={(e) => {
                        const n = Number(e.target.value);
                        if (Number.isInteger(n) && n !== c.maxAgeDays)
                          patch(c.id, { maxAgeDays: n });
                      }}
                      className="h-8 w-20"
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    <button
                      type="button"
                      onClick={() => remove(c)}
                      disabled={pending}
                      title="삭제"
                      className="rounded p-1 text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
        {addForm("doc")}
      </section>

      {/* ── 리스크 기준 ──────────────────────────────────────────────── */}
      <section className="space-y-2">
        <h3 className="text-sm font-semibold">
          리스크 기준 ({riskCriteria.length}) — 2단계 AI 판정에 그대로 들어갑니다
        </h3>
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="border-b bg-muted/50 text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-1.5 text-left font-medium">항목명</th>
                <th className="px-3 py-1.5 text-left font-medium">판정 가이드</th>
                <th className="w-8" />
              </tr>
            </thead>
            <tbody>
              {riskCriteria.map((c) => (
                <tr key={c.id} className="border-b last:border-0 align-top">
                  <td className="px-3 py-1.5">
                    <Input
                      defaultValue={c.label}
                      onBlur={(e) => {
                        if (e.target.value !== c.label)
                          patch(c.id, { label: e.target.value });
                      }}
                      className="h-8 w-48"
                    />
                  </td>
                  <td className="px-3 py-1.5">
                    <Textarea
                      defaultValue={c.guidance}
                      rows={2}
                      onBlur={(e) => {
                        if (e.target.value !== c.guidance)
                          patch(c.id, { guidance: e.target.value });
                      }}
                      className="min-w-[420px] text-xs"
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    <button
                      type="button"
                      onClick={() => remove(c)}
                      disabled={pending}
                      title="삭제"
                      className="rounded p-1 text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
        {addForm("risk")}
      </section>
    </div>
  );
}
