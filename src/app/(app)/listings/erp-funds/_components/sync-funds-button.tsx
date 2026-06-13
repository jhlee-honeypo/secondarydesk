"use client";

import { useState, useTransition } from "react";
import { DownloadCloud } from "lucide-react";

import { Button } from "@/components/ui/button";
import { syncErpFunds, type SyncResult } from "../../bubble-actions";

// ERP 조합 → 운용펀드 일괄 동기화 버튼. effect 미사용.
export function SyncFundsButton() {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<SyncResult | null>(null);

  function run() {
    setResult(null);
    startTransition(async () => {
      setResult(await syncErpFunds());
    });
  }

  return (
    <div className="flex items-center gap-3">
      <Button onClick={run} disabled={pending}>
        <DownloadCloud />
        {pending ? "가져오는 중…" : "운용펀드로 가져오기"}
      </Button>
      {result &&
        (result.ok ? (
          <span className="text-sm text-muted-foreground">
            신규 {result.created}건 · 갱신 {result.updated}건 완료
          </span>
        ) : (
          <span className="text-sm text-destructive">{result.error}</span>
        ))}
    </div>
  );
}
