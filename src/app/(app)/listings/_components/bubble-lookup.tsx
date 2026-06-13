"use client";

import { useRef, useState } from "react";
import { Database, Loader2 } from "lucide-react";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

// Bubble(sparkERP) 검색 입력 + 결과 드롭다운. 명함 검색과 동일하게
// 250ms 디바운스 + 시퀀스 비교로 stale 응답을 폐기하고, 최소 1글자에서 발사.
// effect 미사용(타이머/시퀀스는 ref) — set-state-in-effect lint 회피.
export function BubbleLookup<T>({
  label,
  placeholder,
  search,
  renderItem,
  onPick,
}: {
  label: string;
  placeholder: string;
  search: (q: string) => Promise<T[]>;
  renderItem: (item: T) => React.ReactNode;
  onPick: (item: T) => void;
}) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<T[]>([]);
  const [searching, setSearching] = useState(false);
  const [open, setOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seq = useRef(0);

  function handleChange(value: string) {
    setQ(value);
    setOpen(true);
    if (timer.current) clearTimeout(timer.current);
    const term = value.trim();
    if (term.length < 1) {
      seq.current++;
      setResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    const mySeq = ++seq.current;
    timer.current = setTimeout(async () => {
      const res = await search(term);
      if (mySeq !== seq.current) return; // 더 최신 요청이 있으면 폐기
      setResults(res);
      setSearching(false);
    }, 250);
  }

  function handlePick(item: T) {
    if (timer.current) clearTimeout(timer.current);
    seq.current++;
    onPick(item);
    setQ("");
    setResults([]);
    setOpen(false);
    setSearching(false);
  }

  return (
    <div className="rounded-lg border border-dashed border-border bg-muted/30 p-3">
      <div className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <Database className="size-3.5" />
        {label}
      </div>
      <div className="relative">
        <Input
          value={q}
          placeholder={placeholder}
          onChange={(e) => handleChange(e.target.value)}
          onFocus={() => results.length > 0 && setOpen(true)}
        />
        {open && q.trim().length >= 1 && (
          <div className="absolute z-50 mt-1 max-h-60 w-full overflow-y-auto rounded-md border border-border bg-popover p-1 shadow-md">
            {searching ? (
              <div className="flex items-center gap-2 px-2 py-1.5 text-xs text-muted-foreground">
                <Loader2 className="size-3.5 animate-spin" />
                검색 중…
              </div>
            ) : results.length === 0 ? (
              <div className="px-2 py-1.5 text-xs text-muted-foreground">
                결과 없음
              </div>
            ) : (
              results.map((item, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => handlePick(item)}
                  className={cn(
                    "block w-full rounded-sm px-2 py-1.5 text-left text-sm",
                    "hover:bg-accent hover:text-accent-foreground",
                  )}
                >
                  {renderItem(item)}
                </button>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
