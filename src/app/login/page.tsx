import type { Metadata } from "next";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { LoginForm } from "./login-form";

export const metadata: Metadata = {
  title: "로그인 · SecondaryDesk",
};

export default function LoginPage() {
  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-6">
        <div className="space-y-1 text-center">
          <p className="text-sm font-medium text-primary">SecondaryDesk</p>
          <h1 className="text-2xl font-semibold tracking-tight">로그인</h1>
          <p className="text-sm text-muted-foreground">
            팀 구성원 전용입니다. 계정이 없다면 관리자에게 문의하세요.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">이메일로 로그인</CardTitle>
            <CardDescription>
              등록된 이메일과 비밀번호를 입력하세요.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <LoginForm />
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
