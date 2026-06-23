"use client";

import { useRouter, useSearchParams } from "next/navigation";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SearchableSelect } from "@/components/app/searchable-select";
import { ACTIVITY_TYPES } from "@/lib/types";

const ALL = "all";

const PERIODS = [
  { value: ALL, label: "전체 기간" },
  { value: "30", label: "최근 30일" },
  { value: "90", label: "최근 90일" },
  { value: "180", label: "최근 180일" },
];

/** 전체 활동 피드 필터 — URL 쿼리(type, period, investor)를 갱신해 서버 재조회. */
export function ActivityFilters({
  investors,
  type,
  period,
  investor,
}: {
  investors: { id: string; name: string }[];
  type: string;
  period: string;
  investor: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function setParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value === ALL) params.delete(key);
    else params.set(key, value);
    const qs = params.toString();
    router.push(qs ? `/activities?${qs}` : "/activities");
  }

  const investorOptions = [
    { value: ALL, label: "전체 투자사" },
    ...investors.map((i) => ({ value: i.id, label: i.name })),
  ];

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select value={period || ALL} onValueChange={(v) => setParam("period", v)}>
        <SelectTrigger className="w-36" aria-label="기간 필터">
          <SelectValue placeholder="기간" />
        </SelectTrigger>
        <SelectContent>
          {PERIODS.map((p) => (
            <SelectItem key={p.value} value={p.value}>
              {p.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={type || ALL} onValueChange={(v) => setParam("type", v)}>
        <SelectTrigger className="w-36" aria-label="유형 필터">
          <SelectValue placeholder="유형" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>전체 유형</SelectItem>
          {ACTIVITY_TYPES.map((t) => (
            <SelectItem key={t} value={t}>
              {t}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <SearchableSelect
        value={investor || ALL}
        onValueChange={(v) => setParam("investor", v)}
        options={investorOptions}
        placeholder="전체 투자사"
        searchPlaceholder="투자사 검색…"
        ariaLabel="투자사 필터"
        triggerClassName="w-56"
      />
    </div>
  );
}
