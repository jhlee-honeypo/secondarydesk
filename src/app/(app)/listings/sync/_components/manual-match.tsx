"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { SearchableSelect } from "@/components/app/searchable-select";
import { setListingErpMatch } from "../../sync-actions";

type ErpOption = { id: string; label: string };

// 미매칭 매물 한 건을 ERP 회사에 수기 연결. 선택 즉시 listings.bubble_id 에
// 기록하고 미리보기를 새로고침해 "보정(매칭됨)"으로 넘어가게 한다.
function MatchRow({
  listingId,
  name,
  options,
}: {
  listingId: string;
  name: string;
  options: ErpOption[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function pick(erpCompanyId: string) {
    setError(null);
    startTransition(async () => {
      const res = await setListingErpMatch(listingId, erpCompanyId);
      if (res.ok) router.refresh();
      else setError(res.error ?? "연결에 실패했습니다.");
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-background px-3 py-2">
      <span className="min-w-32 text-sm font-medium">{name}</span>
      <SearchableSelect
        value=""
        onValueChange={pick}
        options={options.map((o) => ({ value: o.id, label: o.label }))}
        placeholder={pending ? "연결 중…" : "ERP 회사 선택…"}
        searchPlaceholder="회사명 검색…"
        triggerClassName="min-w-72 flex-1"
        ariaLabel={`${name} ERP 회사 연결`}
      />
      {error && <span className="text-xs text-destructive">{error}</span>}
    </div>
  );
}

export function ManualMatch({
  unmatched,
  erpCompanies,
}: {
  unmatched: { id: string; name: string }[];
  erpCompanies: ErpOption[];
}) {
  return (
    <div className="space-y-2">
      <div className="text-xs font-medium text-muted-foreground">
        미매칭 — ERP 회사를 직접 골라 연결하세요(연결하면 다음 미리보기에서
        보정 대상으로 넘어갑니다)
      </div>
      {unmatched.map((l) => (
        <MatchRow
          key={l.id}
          listingId={l.id}
          name={l.name}
          options={erpCompanies}
        />
      ))}
    </div>
  );
}
