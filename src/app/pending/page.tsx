import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/supabase/auth";
import { logout } from "@/app/login/actions";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "승인 대기 · SecondaryDesk",
};

export default async function PendingPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  // 이미 승인된 사용자는 앱으로
  if (user.profile?.approved) redirect("/guide");

  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-6">
        <div className="space-y-1 text-center">
          <p className="text-sm font-medium text-primary">SecondaryDesk</p>
          <h1 className="text-2xl font-semibold tracking-tight">승인 대기 중</h1>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">관리자 승인이 필요합니다</CardTitle>
            <CardDescription>
              가입 신청이 접수되었습니다. 관리자가 승인하면 바로 이용할 수
              있습니다. 승인 후 다시 로그인해 주세요.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form action={logout}>
              <Button type="submit" variant="outline" className="w-full">
                로그아웃
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
