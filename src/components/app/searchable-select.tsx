"use client";

import * as React from "react";
import { Popover as PopoverPrimitive } from "radix-ui";
import { Check, ChevronDown, Search } from "lucide-react";

import { cn } from "@/lib/utils";

export type ComboOption = { value: string; label: string };

/**
 * 검색이 가능한 단일 선택 콤보박스. shadcn Select 와 동일한 트리거 외형을
 * 유지하되, 항목이 많을 때 입력으로 좁혀가며 고를 수 있다.
 */
export function SearchableSelect({
  value,
  onValueChange,
  options,
  placeholder = "선택",
  searchPlaceholder = "검색…",
  emptyText = "결과 없음",
  className,
  triggerClassName,
  ariaLabel,
  portal = true,
}: {
  value: string;
  onValueChange: (value: string) => void;
  options: ComboOption[];
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  className?: string;
  triggerClassName?: string;
  ariaLabel?: string;
  // Dialog 안에서는 portal=false 로 두어 스크롤 잠금(react-remove-scroll)에
  // 막히지 않게 한다(밖에서는 기본 Portal 로 클리핑 방지).
  portal?: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");

  const selected = options.find((o) => o.value === value);
  const q = query.trim().toLowerCase();
  const filtered = q
    ? options.filter((o) => o.label.toLowerCase().includes(q))
    : options;

  return (
    <PopoverPrimitive.Root
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setQuery("");
      }}
    >
      <PopoverPrimitive.Trigger
        aria-label={ariaLabel}
        className={cn(
          "flex h-9 items-center justify-between gap-2 rounded-lg border border-input bg-background px-3 py-2 text-sm whitespace-nowrap shadow-xs transition-[color,box-shadow] outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30",
          triggerClassName,
        )}
      >
        <span
          className={cn(
            "line-clamp-1 text-left",
            !selected && "text-muted-foreground",
          )}
        >
          {selected ? selected.label : placeholder}
        </span>
        <ChevronDown className="size-4 shrink-0 opacity-50" />
      </PopoverPrimitive.Trigger>
      <Wrapper portal={portal}>
        <PopoverPrimitive.Content
          align="start"
          sideOffset={4}
          className={cn(
            "z-50 w-(--radix-popover-trigger-width) min-w-48 overflow-hidden rounded-lg border border-border bg-popover text-popover-foreground shadow-md data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
            className,
          )}
          onOpenAutoFocus={(e) => {
            // 콘텐츠 대신 검색 입력에 포커스가 가도록 한다.
            e.preventDefault();
          }}
        >
          <div className="flex items-center gap-2 border-b border-border px-2.5">
            <Search className="size-4 shrink-0 text-muted-foreground" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={searchPlaceholder}
              className="h-9 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
          </div>
          <div className="max-h-64 overflow-y-auto p-1">
            {filtered.length === 0 ? (
              <p className="px-2 py-6 text-center text-sm text-muted-foreground">
                {emptyText}
              </p>
            ) : (
              filtered.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => {
                    onValueChange(o.value);
                    setOpen(false);
                    setQuery("");
                  }}
                  className={cn(
                    "relative flex w-full cursor-default items-center gap-2 rounded-md py-1.5 pr-8 pl-2 text-left text-sm outline-none hover:bg-accent hover:text-accent-foreground",
                    o.value === value && "bg-accent/50",
                  )}
                >
                  <span className="line-clamp-1 flex-1">{o.label}</span>
                  {o.value === value && (
                    <Check className="absolute right-2 size-4" />
                  )}
                </button>
              ))
            )}
          </div>
        </PopoverPrimitive.Content>
      </Wrapper>
    </PopoverPrimitive.Root>
  );
}

// portal=true 면 Portal 로 감싸고, false 면 그대로 둔다(Dialog 내 스크롤 호환).
function Wrapper({
  portal,
  children,
}: {
  portal: boolean;
  children: React.ReactNode;
}) {
  return portal ? (
    <PopoverPrimitive.Portal>{children}</PopoverPrimitive.Portal>
  ) : (
    <>{children}</>
  );
}
