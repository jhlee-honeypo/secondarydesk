import { Search } from "lucide-react";

/** 상단바 전역 검색(F9). 네이티브 GET 폼으로 /search?q= 로 이동. */
export function HeaderSearch({ defaultValue }: { defaultValue?: string }) {
  return (
    <form action="/search" className="relative w-full max-w-sm">
      <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <input
        name="q"
        defaultValue={defaultValue}
        placeholder="투자사 · 매물 · 컨택 검색"
        aria-label="전역 검색"
        className="h-9 w-full rounded-lg border border-input bg-background py-1 pl-8 pr-3 text-sm shadow-xs outline-none transition-[color,box-shadow] placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
      />
    </form>
  );
}
