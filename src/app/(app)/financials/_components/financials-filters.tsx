"use client";

import { useRouter } from "next/navigation";

import {
  SearchableSelect,
  type ComboOption,
} from "@/components/app/searchable-select";

// 조합(운용펀드) + 분기 필터 → URL ?fund=&period= 로 반영. 둘 다 미선택이면 빈 화면.
export function FinancialsFilters({
  funds,
  periods,
  fund,
  period,
}: {
  funds: ComboOption[];
  periods: ComboOption[];
  fund: string;
  period: string;
}) {
  const router = useRouter();

  const go = (next: { fund?: string; period?: string }) => {
    const f = next.fund ?? fund;
    const p = next.period ?? period;
    const params = new URLSearchParams();
    if (f) params.set("fund", f);
    if (p) params.set("period", p);
    const qs = params.toString();
    router.push(qs ? `/financials?${qs}` : "/financials");
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <SearchableSelect
        value={fund}
        onValueChange={(v) => go({ fund: v })}
        options={funds}
        placeholder="조합 선택"
        searchPlaceholder="조합 검색"
        ariaLabel="조합"
        triggerClassName="w-64"
      />
      <SearchableSelect
        value={period}
        onValueChange={(v) => go({ period: v })}
        options={periods}
        placeholder="분기"
        searchPlaceholder="분기 검색"
        ariaLabel="분기"
        triggerClassName="w-40"
      />
    </div>
  );
}
