"use client";

import { useRouter, useSearchParams } from "next/navigation";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const ALL = "all";

const PERIODS = [
  { value: ALL, label: "전체 기간" },
  { value: "30", label: "최근 30일" },
  { value: "90", label: "최근 90일" },
  { value: "180", label: "최근 180일" },
];

/** 대시보드 기간·운용펀드 필터(F11). URL 쿼리(period, fund)를 갱신해 서버 재집계. */
export function DashboardFilters({
  holdingFunds,
  period,
  fund,
}: {
  holdingFunds: { id: string; name: string }[];
  period: string;
  fund: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function setParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value === ALL) params.delete(key);
    else params.set(key, value);
    const qs = params.toString();
    router.push(qs ? `/?${qs}` : "/");
  }

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

      <Select value={fund || ALL} onValueChange={(v) => setParam("fund", v)}>
        <SelectTrigger className="w-48" aria-label="운용펀드 필터">
          <SelectValue placeholder="운용펀드" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>전체 운용펀드</SelectItem>
          {holdingFunds.map((f) => (
            <SelectItem key={f.id} value={f.id}>
              {f.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
