"use client";

import { useState, useTransition } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DeleteDialog } from "@/components/app/delete-dialog";
import { formatDate } from "@/lib/format";
import { rejectUser, setUserApproved } from "../actions";

export type MemberRow = {
  id: string;
  name: string | null;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  role: "member" | "lead";
  approved: boolean;
  created_at: string;
};

function displayName(u: MemberRow): string {
  if (u.last_name || u.first_name)
    return `${u.last_name ?? ""}${u.first_name ?? ""}`;
  return u.name ?? u.email ?? "—";
}

export function MembersManager({
  pending,
  approved,
  currentUserId,
}: {
  pending: MemberRow[];
  approved: MemberRow[];
  currentUserId: string;
}) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function run(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) setError(res.error ?? "처리에 실패했습니다.");
    });
  }

  return (
    <div className="space-y-8">
      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}

      {/* 승인 대기 */}
      <section className="space-y-3">
        <h2 className="flex items-center gap-2 text-sm font-medium">
          승인 대기
          <Badge variant="secondary">{pending.length}</Badge>
        </h2>
        {pending.length === 0 ? (
          <p className="text-sm text-muted-foreground">대기 중인 가입 신청이 없습니다.</p>
        ) : (
          <div className="divide-y divide-border rounded-lg border border-border">
            {pending.map((u) => (
              <div
                key={u.id}
                className="flex items-center justify-between gap-3 px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{displayName(u)}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {u.email} · 신청 {formatDate(u.created_at)}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Button
                    size="sm"
                    disabled={isPending}
                    onClick={() => run(() => setUserApproved(u.id, true))}
                  >
                    승인
                  </Button>
                  <DeleteDialog
                    trigger={
                      <Button size="sm" variant="outline" disabled={isPending}>
                        거부
                      </Button>
                    }
                    title="가입을 거부할까요?"
                    description={`'${displayName(u)}'(${u.email}) 의 가입 신청을 거부합니다. 프로필이 삭제되어 접근이 차단됩니다.`}
                    action={async () => {
                      await rejectUser(u.id);
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* 승인된 구성원 */}
      <section className="space-y-3">
        <h2 className="flex items-center gap-2 text-sm font-medium">
          구성원
          <Badge variant="secondary">{approved.length}</Badge>
        </h2>
        <div className="divide-y divide-border rounded-lg border border-border">
          {approved.map((u) => {
            const isSelf = u.id === currentUserId;
            return (
              <div
                key={u.id}
                className="flex items-center justify-between gap-3 px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    {displayName(u)}
                    {u.role === "lead" && (
                      <Badge variant="outline" className="ml-2">
                        관리자
                      </Badge>
                    )}
                    {isSelf && (
                      <span className="ml-2 text-xs text-muted-foreground">(나)</span>
                    )}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">{u.email}</p>
                </div>
                {!isSelf && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={isPending}
                    onClick={() => run(() => setUserApproved(u.id, false))}
                  >
                    승인 취소
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
