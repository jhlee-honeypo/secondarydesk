"use client";

import { useRouter, useSearchParams } from "next/navigation";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  LISTING_STATUS_LABEL,
  SELECTABLE_LISTING_STATUSES,
  type HoldingFund,
} from "@/lib/types";

const ALL = "all";

/** 상태/운용펀드 드롭다운 변경 시 URL 쿼리(status, fund)를 갱신해 서버 필터링을 트리거. */
export function ListingFilters({
  holdingFunds,
  status,
  fund,
}: {
  holdingFunds: HoldingFund[];
  status: string;
  fund: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function setParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value === ALL) params.delete(key);
    else params.set(key, value);
    const qs = params.toString();
    router.push(qs ? `/listings?${qs}` : "/listings");
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select
        value={status || ALL}
        onValueChange={(v) => setParam("status", v)}
      >
        <SelectTrigger className="w-40" aria-label="상태 필터">
          <SelectValue placeholder="상태" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>전체 상태</SelectItem>
          {SELECTABLE_LISTING_STATUSES.map((s) => (
            <SelectItem key={s} value={s}>
              {LISTING_STATUS_LABEL[s]}
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
          {holdingFunds.map((hf) => (
            <SelectItem key={hf.id} value={hf.id}>
              {hf.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
