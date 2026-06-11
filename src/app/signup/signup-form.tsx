"use client";

import Link from "next/link";
import { useActionState } from "react";

import { signup, type SignupState } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function SignupForm() {
  const [state, formAction, pending] = useActionState<SignupState, FormData>(
    signup,
    undefined,
  );

  if (state?.ok) {
    return (
      <div className="space-y-4 text-center">
        <p className="text-sm text-foreground">
          가입 신청이 접수되었습니다.
          <br />
          관리자 승인 후 로그인할 수 있습니다.
        </p>
        <Button asChild variant="outline" className="w-full">
          <Link href="/login">로그인 화면으로</Link>
        </Button>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor="last_name">성</Label>
          <Input id="last_name" name="last_name" placeholder="이" required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="first_name">이름</Label>
          <Input
            id="first_name"
            name="first_name"
            placeholder="준행"
            required
          />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="email">이메일</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          placeholder="name@sparklabs.co.kr"
          required
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="password">비밀번호</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          placeholder="8자 이상"
          required
        />
      </div>
      {state && !state.ok && (
        <p className="text-sm text-destructive" role="alert">
          {state.error}
        </p>
      )}
      <Button type="submit" size="lg" className="w-full" disabled={pending}>
        {pending ? "가입 신청 중…" : "가입 신청"}
      </Button>
    </form>
  );
}
