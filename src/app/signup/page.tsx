import type { Metadata } from "next";
import Link from "next/link";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { SignupForm } from "./signup-form";

export const metadata: Metadata = {
  title: "가입 신청 · SecondaryDesk",
};

export default function SignupPage() {
  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-6">
        <div className="space-y-1 text-center">
          <p className="text-sm font-medium text-primary">SecondaryDesk</p>
          <h1 className="text-2xl font-semibold tracking-tight">가입 신청</h1>
          <p className="text-sm text-muted-foreground">
            관리자 승인 후 이용할 수 있습니다.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">계정 만들기</CardTitle>
            <CardDescription>성·이름과 이메일로 가입을 신청하세요.</CardDescription>
          </CardHeader>
          <CardContent>
            <SignupForm />
          </CardContent>
        </Card>

        <p className="text-center text-sm text-muted-foreground">
          이미 계정이 있으신가요?{" "}
          <Link href="/login" className="font-medium text-primary hover:underline">
            로그인
          </Link>
        </p>
      </div>
    </main>
  );
}
