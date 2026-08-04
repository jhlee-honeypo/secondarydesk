"use client";

import { Badge } from "@/components/ui/badge";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import { HEALTH_LABEL, type HealthLevel } from "@/lib/financial-health";

const HEALTH_VARIANT: Record<HealthLevel, "destructive" | "secondary" | "outline"> = {
  danger: "destructive",
  warning: "secondary",
  good: "outline",
};

/** 상태 배지 — 마우스를 올리면 판정 근거와 갱신 시각을 띄운다(별도 '근거' 열 대체). */
export function HealthBadge({
  level,
  reasons,
  updatedLabel,
}: {
  level: HealthLevel;
  reasons: string[];
  updatedLabel: string;
}) {
  return (
    <HoverCard openDelay={100} closeDelay={120}>
      {/* asChild 대상은 ref 를 받을 DOM 노드여야 하므로 배지를 span 으로 감싼다. */}
      <HoverCardTrigger asChild>
        <span className="cursor-help">
          <Badge variant={HEALTH_VARIANT[level]}>{HEALTH_LABEL[level]}</Badge>
        </span>
      </HoverCardTrigger>

      <HoverCardContent className="w-72 space-y-1.5">
        <div className="text-[10px] font-medium text-muted-foreground">판정 근거</div>
        <ul className="space-y-0.5 text-xs">
          {reasons.map((r) => (
            <li key={r} className="flex gap-1.5">
              <span className="text-muted-foreground">·</span>
              <span className="min-w-0 flex-1 select-text">{r}</span>
            </li>
          ))}
        </ul>
        <div className="border-t pt-1.5 text-[10px] text-muted-foreground">
          갱신 {updatedLabel}
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}
