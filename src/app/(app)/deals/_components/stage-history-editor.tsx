"use client";

import { useEffect, useState, useTransition } from "react";
import { Trash2 } from "lucide-react";

import { DEAL_STAGES, type DealStage } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  deleteStageEvent,
  getDealStageEvents,
  updateStageEvent,
  type StageEventRow,
} from "../actions";

/** timestamptz → <input type="date"> 값(YYYY-MM-DD, 로컬 기준). */
function toDateInput(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

/**
 * 딜 수정 폼의 "단계 이력" 관리 섹션.
 * 잘못된 이동으로 쌓인 이력을 행별로 단계·일자 수정하거나 삭제한다.
 * 변경은 딜 저장과 별개로 즉시 서버에 반영(낙관적 업데이트)되며, 보드 카드도 갱신된다.
 */
export function StageHistoryEditor({ dealId }: { dealId: string }) {
  const [events, setEvents] = useState<StageEventRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  useEffect(() => {
    let cancelled = false;
    getDealStageEvents(dealId).then((res) => {
      if (cancelled) return;
      if (res.ok) setEvents(res.events);
      else setError(res.error);
    });
    return () => {
      cancelled = true;
    };
  }, [dealId]);

  function handleDelete(id: string) {
    setEvents((cur) => cur?.filter((e) => e.id !== id) ?? cur);
    startTransition(async () => {
      const res = await deleteStageEvent(id);
      if (!res.ok) setError(res.error);
    });
  }

  function handleStageChange(id: string, stage: DealStage) {
    setEvents((cur) =>
      cur?.map((e) => (e.id === id ? { ...e, stage } : e)) ?? cur,
    );
    startTransition(async () => {
      const res = await updateStageEvent(id, { stage });
      if (!res.ok) setError(res.error);
    });
  }

  function handleDateChange(id: string, date: string) {
    if (!date) return;
    setEvents((cur) =>
      cur?.map((e) => (e.id === id ? { ...e, changed_at: date } : e)) ?? cur,
    );
    startTransition(async () => {
      const res = await updateStageEvent(id, { changed_at: date });
      if (!res.ok) setError(res.error);
    });
  }

  return (
    <div className="space-y-2 rounded-lg border border-border p-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">단계 이력</p>
        <span className="text-xs text-muted-foreground">
          변경·삭제는 즉시 저장됩니다
        </span>
      </div>

      {error && (
        <p className="text-xs text-destructive" role="alert">
          {error}
        </p>
      )}

      {events === null ? (
        <p className="text-xs text-muted-foreground">불러오는 중…</p>
      ) : events.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          기록된 단계 이력이 없습니다.
        </p>
      ) : (
        <div className="space-y-2">
          {events.map((ev) => (
            <div key={ev.id} className="flex items-center gap-2">
              <Select
                value={ev.stage}
                onValueChange={(v) => handleStageChange(ev.id, v as DealStage)}
              >
                <SelectTrigger className="h-8 w-32" aria-label="단계">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DEAL_STAGES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                type="date"
                className="h-8 flex-1"
                aria-label="진입 일자"
                value={toDateInput(ev.changed_at)}
                onChange={(e) => handleDateChange(ev.id, e.target.value)}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="이력 삭제"
                onClick={() => handleDelete(ev.id)}
              >
                <Trash2 />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
