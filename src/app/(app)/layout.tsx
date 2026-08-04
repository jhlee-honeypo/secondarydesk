import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/supabase/auth";
import { APP_VERSION_LABEL } from "@/lib/version";
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
  // 승인 전(또는 프로필 없음) 사용자는 앱 데이터 접근 차단 → 승인 대기 화면
  if (!user.profile?.approved) redirect("/pending");

  const name = user.profile?.name ?? user.email ?? "사용자";
  const isLead = user.profile?.role === "lead";

  return (
    <div className="flex min-h-svh flex-1">
      {/* 좌측 레일: 평소엔 얇게(아이콘만) 자리만 차지하고, 호버하면 그 위로
          오버레이되며 펼쳐진다(콘텐츠 리플로우 없음).
          본문을 아래로 스크롤해도 메뉴가 따라오도록 뷰포트 높이(h-svh)로 고정한다.
          flex 기본 stretch 면 높이가 문서 전체가 되어 sticky 가 동작하지 않으므로
          self-start 로 늘어남을 막는다. */}
      <div className="sticky top-0 hidden h-svh w-16 shrink-0 self-start md:block">
        <aside className="group absolute inset-y-0 left-0 z-40 flex w-16 flex-col overflow-hidden border-r border-sidebar-border bg-sidebar transition-[width] duration-200 ease-out hover:w-60 hover:shadow-xl">
          <div className="flex h-14 items-center gap-2 px-5">
            <span className="size-5 shrink-0 rounded-md bg-primary" aria-hidden />
            <span className="whitespace-nowrap text-sm font-semibold tracking-tight opacity-0 transition-opacity duration-200 group-hover:opacity-100">
              SecondaryDesk
            </span>
          </div>
          <div className="mt-2 flex-1 overflow-y-auto overflow-x-hidden pb-4">
            <SidebarNav isLead={isLead} />
          </div>
          <div className="mt-auto border-t border-sidebar-border px-5 py-3">
            <span className="block whitespace-nowrap text-xs font-medium text-sidebar-foreground/70 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
              {APP_VERSION_LABEL}
            </span>
          </div>
        </aside>
      </div>

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
