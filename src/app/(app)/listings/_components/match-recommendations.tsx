"use client";

import { useState, useTransition } from "react";
import { Check, Plus } from "lucide-react";

import type { MatchResult } from "@/lib/match";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { createDealFromMatch } from "../../deals/actions";

export function MatchRecommendations({
  listingId,
  matches,
  dealtInvestorIds,
}: {
  listingId: string;
  matches: MatchResult[];
  dealtInvestorIds: string[];
}) {
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const dealt = new Set(dealtInvestorIds);

  function handleCreate(investorId: string, fundId: string) {
    setError(null);
    setPendingId(fundId);
    startTransition(async () => {
      const res = await createDealFromMatch(listingId, investorId, fundId);
      setPendingId(null);
      if (!res.ok) setError(res.error);
    });
  }

  if (matches.length === 0) {
    return (
      <Card className="items-center justify-center py-12 text-center">
        <p className="text-sm text-muted-foreground">
          점수를 매길 조합이 없습니다. 투자사 상세에서 조합(mandate)을 먼저
          등록하세요.
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        이 매물의 단계·섹터·희망 밸류와 각 조합의 mandate(투자단계·섹터·드라이파우더·구주
        선호도·만기)를 비교해 적합도 순으로 정렬했습니다. 추천에서 바로 딜을 만들 수
        있습니다.
      </p>

      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}

      {matches.map((m, idx) => {
        const investorId = m.fund.investor?.id;
        const alreadyDealt = investorId ? dealt.has(investorId) : false;
        return (
          <Card key={m.fund.id} size="sm" className="flex-row items-start gap-3 p-3">
            <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium text-muted-foreground">
              {idx + 1}
            </div>

            <div className="min-w-0 flex-1 space-y-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">
                  {m.fund.investor?.name ?? "—"}
                </span>
                <span className="text-xs text-muted-foreground">
                  {m.fund.name}
                </span>
                <Badge variant={m.score > 0 ? "default" : "outline"}>
                  점수 {m.score}
                </Badge>
              </div>

              {m.reasons.length > 0 ? (
                <div className="flex flex-wrap gap-1">
                  {m.reasons.map((r) => (
                    <Badge
                      key={r.label}
                      variant={r.delta >= 0 ? "secondary" : "destructive"}
                    >
                      {r.label} {r.delta >= 0 ? `+${r.delta}` : r.delta}
                    </Badge>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground/70">
                  매칭 신호 없음(매물 단계·섹터·밸류 또는 조합 mandate 미입력)
                </p>
              )}
            </div>

            {alreadyDealt ? (
              <Badge variant="outline" className="shrink-0 gap-1">
                <Check className="size-3" />딜 있음
              </Badge>
            ) : (
              <Button
                size="sm"
                variant="outline"
                className="shrink-0"
                disabled={!investorId || pendingId === m.fund.id}
                onClick={() =>
                  investorId && handleCreate(investorId, m.fund.id)
                }
              >
                <Plus />
                {pendingId === m.fund.id ? "생성 중…" : "딜 생성"}
              </Button>
            )}
          </Card>
        );
      })}
    </div>
  );
}
