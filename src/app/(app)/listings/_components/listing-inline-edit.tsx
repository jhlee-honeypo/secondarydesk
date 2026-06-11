"use client";

import { useState, useTransition } from "react";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  LISTING_STATUS_LABEL,
  LISTING_STATUS_VARIANT,
  SECTOR_OPTIONS,
  SELECTABLE_LISTING_STATUSES,
  type ListingStatus,
} from "@/lib/types";
import { cn } from "@/lib/utils";
import { updateListingInline } from "../actions";

const TRIGGER_CLS =
  "h-7 w-auto gap-1 border-0 bg-transparent px-1 shadow-none hover:bg-muted/60 focus-visible:ring-0 data-[state=open]:bg-muted/60";

/** 상태 인라인 수정 — 컬러 배지를 트리거로 쓰는 드롭다운(변경 즉시 저장). */
export function StatusCell({
  id,
  value,
}: {
  id: string;
  value: ListingStatus;
}) {
  const [status, setStatus] = useState<ListingStatus>(value);
  const [pending, start] = useTransition();

  function onChange(v: string) {
    const next = v as ListingStatus;
    const prev = status;
    setStatus(next);
    start(async () => {
      const res = await updateListingInline(id, { status: next });
      if (!res.ok) setStatus(prev); // 실패 시 롤백
    });
  }

  return (
    <Select value={status} onValueChange={onChange}>
      <SelectTrigger
        className={cn(TRIGGER_CLS, pending && "opacity-60")}
        aria-label="상태 변경"
      >
        <Badge variant={LISTING_STATUS_VARIANT[status]}>
          {LISTING_STATUS_LABEL[status]}
        </Badge>
      </SelectTrigger>
      <SelectContent>
        {SELECTABLE_LISTING_STATUSES.map((s) => (
          <SelectItem key={s} value={s}>
            {LISTING_STATUS_LABEL[s]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** 섹터 인라인 수정 — 드롭다운(변경 즉시 저장). 미지정이면 placeholder. */
export function SectorCell({
  id,
  value,
}: {
  id: string;
  value: string | null;
}) {
  const [sector, setSector] = useState<string | null>(value);
  const [pending, start] = useTransition();

  function onChange(v: string) {
    const prev = sector;
    setSector(v);
    start(async () => {
      const res = await updateListingInline(id, { sector: v });
      if (!res.ok) setSector(prev);
    });
  }

  return (
    <Select value={sector ?? undefined} onValueChange={onChange}>
      <SelectTrigger
        className={cn(
          TRIGGER_CLS,
          "text-muted-foreground",
          pending && "opacity-60",
        )}
        aria-label="섹터 변경"
      >
        <SelectValue placeholder="섹터 선택" />
      </SelectTrigger>
      <SelectContent>
        {SECTOR_OPTIONS.map((s) => (
          <SelectItem key={s} value={s}>
            {s}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
