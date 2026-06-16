"use client";

import { Badge } from "@/components/ui/badge";
import {
  LISTING_STATUS_LABEL,
  LISTING_STATUS_VARIANT,
  type ListingStatus,
} from "@/lib/types";

/** 상태 표시 — 컬러 배지(읽기 전용, 인라인 수정 비활성). */
export function StatusCell({ value }: { id: string; value: ListingStatus }) {
  return (
    <Badge variant={LISTING_STATUS_VARIANT[value]}>
      {LISTING_STATUS_LABEL[value]}
    </Badge>
  );
}

/** 섹터 표시 — 텍스트(읽기 전용, 인라인 수정 비활성). 미지정이면 대시. */
export function SectorCell({ value }: { id: string; value: string | null }) {
  return (
    <span className="text-sm text-muted-foreground">{value ?? "—"}</span>
  );
}
