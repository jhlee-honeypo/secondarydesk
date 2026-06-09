import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/supabase/auth";
import { SidebarNav } from "@/components/app/sidebar-nav";
import { UserMenu } from "@/components/app/user-menu";
import { HeaderSearch } from "@/components/app/header-search";

/** 인증된 영역의 공통 셸(좌측 네비 + 상단 바). PRD §12.1. */
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const name = user.profile?.name ?? user.email ?? "사용자";

  return (
    <div className="flex min-h-svh flex-1">
      <aside className="hidden w-60 shrink-0 flex-col border-r border-sidebar-border bg-sidebar md:flex">
        <div className="flex h-14 items-center gap-2 px-5">
          <span className="size-5 rounded-md bg-primary" aria-hidden />
          <span className="text-sm font-semibold tracking-tight">
            SecondaryDesk
          </span>
        </div>
        <div className="mt-2 flex-1 overflow-y-auto pb-4">
          <SidebarNav />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-4 border-b border-border bg-background/80 px-6 backdrop-blur">
          <HeaderSearch />
          <UserMenu
            name={name}
            email={user.email}
            role={user.profile?.role}
          />
        </header>
        <main className="flex-1 overflow-auto p-6">{children}</main>
      </div>
    </div>
  );
}
