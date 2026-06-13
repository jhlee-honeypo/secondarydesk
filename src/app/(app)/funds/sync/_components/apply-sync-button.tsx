"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { applyErpSync, type ApplyResult } from "../../../listings/sync-actions";

// 미리보기 확인 후 동기화 적용. 성공 시 router.refresh 로 미리보기 재계산.
export function ApplySyncButton({ disabled }: { disabled?: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<ApplyResult | null>(null);

  function run() {
    setResult(null);
    startTransition(async () => {
      const res = await applyErpSync();
      setResult(res);
      if (res.ok) router.refresh();
    });
  }

  return (
    <div className="flex items-center gap-3">
      <Button onClick={run} disabled={pending || disabled}>
        <RefreshCw className={pending ? "animate-spin" : undefined} />
        {pending ? "동기화 중…" : "동기화 적용"}
      </Button>
      {result &&
        (result.ok ? (
          <span className="text-sm text-muted-foreground">
            펀드 신규 {result.fundsCreated}·갱신 {result.fundsUpdated} / 매물 보정{" "}
            {result.listingsUpdated} · 조합연결 +{result.fundLinksAdded} 완료
          </span>
        ) : (
          <span className="text-sm text-destructive">{result.error}</span>
        ))}
    </div>
  );
}
