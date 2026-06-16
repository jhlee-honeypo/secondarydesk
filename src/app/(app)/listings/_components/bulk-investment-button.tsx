"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Database } from "lucide-react";

import { Button } from "@/components/ui/button";
import { syncAllListingInvestments } from "../bubble-actions";

// sparkERP 투자내역을 ERP 매칭된 매물 전체에 일괄로 채우는 버튼.
// 투자내역이 있는 매물의 EXIT 라운드를 ERP 값으로 교체(없는 매물은 보존).
export function BulkInvestmentButton() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  function run() {
    if (
      !window.confirm(
        "sparkERP에 매칭된 매물의 투자 라운드를 ERP 투자내역으로 채웁니다.\n" +
          "해당 매물에 이미 입력된 라운드는 ERP 값으로 교체됩니다. 진행할까요?",
      )
    )
      return;
    setMsg(null);
    start(async () => {
      const res = await syncAllListingInvestments();
      if (!res.ok) {
        setMsg(`오류: ${res.error}`);
        return;
      }
      setMsg(
        `매물 ${res.listingsUpdated}곳에 라운드 ${res.roundsCreated}건 채움` +
          (res.fundTagsAdded ? ` · 펀드 ${res.fundTagsAdded}건 태깅` : "") +
          (res.skipped ? ` · 투자내역 없어 건너뜀 ${res.skipped}곳` : ""),
      );
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button variant="outline" onClick={run} disabled={pending}>
        <Database />
        {pending ? "채우는 중…" : "투자내역 일괄 채우기"}
      </Button>
      {msg && (
        <span className="max-w-xs text-right text-xs text-muted-foreground">
          {msg}
        </span>
      )}
    </div>
  );
}
