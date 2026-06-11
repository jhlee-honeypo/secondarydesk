"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Building2,
  Calculator,
  KanbanSquare,
  LayoutDashboard,
  Package,
  Users,
} from "lucide-react";

import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "/", label: "대시보드", icon: LayoutDashboard, ready: true },
  { href: "/deals", label: "딜 보드", icon: KanbanSquare, ready: true },
  { href: "/investors", label: "투자사", icon: Building2, ready: true },
  { href: "/listings", label: "매물", icon: Package, ready: true },
  { href: "/exit-scenario", label: "EXIT 시나리오", icon: Calculator, ready: true },
];

// lead(관리자) 전용 항목
const LEAD_NAV_ITEMS = [
  { href: "/members", label: "구성원", icon: Users, ready: true },
];

export function SidebarNav({ isLead = false }: { isLead?: boolean }) {
  const pathname = usePathname();
  const items = isLead ? [...NAV_ITEMS, ...LEAD_NAV_ITEMS] : NAV_ITEMS;

  return (
    <nav className="flex flex-col gap-0.5 px-3">
      {items.map(({ href, label, icon: Icon, ready }) => {
        if (!ready) {
          return (
            <span
              key={href}
              className="flex cursor-not-allowed items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-sidebar-foreground/40 select-none"
              title="다음 단계에서 추가됩니다"
            >
              <Icon className="size-4 shrink-0" />
              <span className="whitespace-nowrap opacity-0 transition-opacity duration-200 group-hover:opacity-100">
                {label}
              </span>
              <span className="ml-auto rounded bg-muted px-1.5 py-0.5 text-[10px] font-normal text-muted-foreground opacity-0 transition-opacity duration-200 group-hover:opacity-100">
                예정
              </span>
            </span>
          );
        }

        const active =
          href === "/" ? pathname === "/" : pathname.startsWith(href);

        return (
          <Link
            key={href}
            href={href}
            className={cn(
              "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              active
                ? "bg-sidebar-accent text-sidebar-accent-foreground"
                : "text-sidebar-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
            )}
          >
            <Icon className="size-4 shrink-0" />
            <span className="whitespace-nowrap opacity-0 transition-opacity duration-200 group-hover:opacity-100">
              {label}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
