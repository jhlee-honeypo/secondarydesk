import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/supabase/auth";
import { MembersManager, type MemberRow } from "./_components/members-manager";

export const dynamic = "force-dynamic";

export default async function MembersPage() {
  const me = await getCurrentUser();
  if (!me) redirect("/login");
  if (me.profile?.role !== "lead") redirect("/");

  const supabase = await createClient();
  const { data } = await supabase
    .from("users")
    .select("id, name, email, first_name, last_name, role, approved, created_at")
    .order("created_at", { ascending: true });

  const users = (data ?? []) as MemberRow[];
  const pending = users.filter((u) => !u.approved);
  const approved = users.filter((u) => u.approved);

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">구성원</h1>
        <p className="text-sm text-muted-foreground">
          가입 신청을 승인하거나 거부하고, 팀 구성원을 관리합니다.
        </p>
      </div>

      <MembersManager
        pending={pending}
        approved={approved}
        currentUserId={me.id}
      />
    </div>
  );
}
