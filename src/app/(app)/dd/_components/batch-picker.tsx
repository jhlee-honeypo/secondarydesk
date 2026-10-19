"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

import { createBatch, deleteBatch } from "../actions";
import type { DdBatch } from "../types";

/** 배치(기수) 선택 + 생성. 배치가 기준·기업·판정의 최상위 묶음이다. */
export function BatchPicker({
  batches,
  selectedId,
}: {
  batches: DdBatch[];
  selectedId: string | null;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState("");

  const submit = () => {
    setError("");
    start(async () => {
      const res = await createBatch(name);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setName("");
      setAdding(false);
      router.push(`/dd?batch=${res.data}`);
    });
  };

  const remove = (id: string, label: string) => {
    if (!confirm(`'${label}' 배치를 삭제합니다. 기업·서류·판정이 모두 지워집니다.`))
      return;
    start(async () => {
      const res = await deleteBatch(id);
      if (!res.ok) setError(res.error);
      else router.push("/dd");
    });
  };

  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-center gap-2">
        {batches.map((b) => (
          <div key={b.id} className="group relative">
            <button
              type="button"
              onClick={() => router.push(`/dd?batch=${b.id}`)}
              className={cn(
                "rounded-lg border px-3 py-1.5 pr-7 text-sm font-medium transition-colors",
                b.id === selectedId
                  ? "border-primary bg-primary/10 text-foreground"
                  : "border-border text-muted-foreground hover:bg-muted",
              )}
            >
              {b.name}
              <span className="ml-2 text-xs text-muted-foreground">
                {b.companyCount}개사
              </span>
            </button>
            <button
              type="button"
              onClick={() => remove(b.id, b.name)}
              disabled={pending}
              title="배치 삭제"
              className="absolute top-1/2 right-1.5 -translate-y-1/2 rounded p-0.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:text-destructive"
            >
              <Trash2 className="size-3.5" />
            </button>
          </div>
        ))}

        {adding ? (
          <div className="flex items-center gap-2">
            <Input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") submit();
                if (e.key === "Escape") setAdding(false);
              }}
              placeholder="예: 2026 상반기 배치"
              className="h-8 w-56"
            />
            <Button size="sm" onClick={submit} disabled={pending}>
              만들기
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setAdding(false)}>
              취소
            </Button>
          </div>
        ) : (
          <Button size="sm" variant="outline" onClick={() => setAdding(true)}>
            <Plus className="size-4" />
            배치 추가
          </Button>
        )}
      </div>

      {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
    </Card>
  );
}
