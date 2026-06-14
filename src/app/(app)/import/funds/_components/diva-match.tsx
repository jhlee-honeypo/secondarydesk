"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { SearchableSelect } from "@/components/app/searchable-select";
import { mergeInvestorWithDiva } from "../actions";

type Opt = { id: string; label: string };

// 미매칭 투자사 한 곳을 DIVA 운용사에 직접 연결(병합). 선택 즉시 그 운용사의
// 조합을 이 투자사로 옮기고 중복 투자사를 정리한 뒤 새로고침한다.
function MatchRow({
  investorId,
  name,
  options,
}: {
  investorId: string;
  name: string;
  options: Opt[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function pick(divaId: string) {
    setError(null);
    startTransition(async () => {
      const res = await mergeInvestorWithDiva(investorId, divaId);
      if (res.ok) router.refresh();
      else setError(res.error);
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-background px-3 py-2">
      <span className="min-w-32 text-sm font-medium">{name}</span>
      <SearchableSelect
        value=""
        onValueChange={pick}
        options={options.map((o) => ({ value: o.id, label: o.label }))}
        placeholder={pending ? "연결 중…" : "DIVA 운용사 선택…"}
        searchPlaceholder="운용사명 검색…"
        triggerClassName="min-w-72 flex-1"
        ariaLabel={`${name} DIVA 운용사 연결`}
      />
      {error && <span className="text-xs text-destructive">{error}</span>}
    </div>
  );
}

export function DivaMatch({
  unmatched,
  divaOptions,
}: {
  unmatched: { id: string; name: string }[];
  divaOptions: Opt[];
}) {
  if (divaOptions.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        먼저 위에서 가져오기를 실행하면, 여기에 DIVA 운용사와 매칭되지 않은
        기존 투자사가 나타납니다. (실행 후 페이지 새로고침)
      </p>
    );
  }
  if (unmatched.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        DIVA 미연결 투자사가 없습니다. 모두 매칭되었습니다.
      </p>
    );
  }
  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">
        아래는 DIVA 운용사와 자동 매칭되지 않은 기존 투자사입니다. 같은 회사를
        직접 골라 연결하세요(연결하면 그 운용사의 조합이 이 투자사로 합쳐집니다).
        DIVA에 없는 투자사는 그냥 두면 됩니다.
      </p>
      {unmatched.map((inv) => (
        <MatchRow
          key={inv.id}
          investorId={inv.id}
          name={inv.name}
          options={divaOptions}
        />
      ))}
    </div>
  );
}
