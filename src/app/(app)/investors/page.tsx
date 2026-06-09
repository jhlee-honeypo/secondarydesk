import Link from "next/link";
import { Plus, Upload } from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/supabase/auth";
import type { InvestorWithOwner, UserRow } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { InvestorFormDialog } from "./_components/investor-form-dialog";

export const dynamic = "force-dynamic";

export default async function InvestorsPage() {
  const supabase = await createClient();
  const me = await getCurrentUser();

  const [{ data: investors }, { data: users }] = await Promise.all([
    supabase
      .from("investors")
      .select("*, owner:users(name, email)")
      .order("name"),
    supabase.from("users").select("id, name, email, role").order("name"),
  ]);

  const rows = (investors ?? []) as InvestorWithOwner[];
  const teamUsers = (users ?? []) as UserRow[];

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">투자사</h1>
          <p className="text-sm text-muted-foreground">
            구주 매수 후보 투자사를 등록하고 상세에서 조합·컨택을 관리합니다.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" asChild>
            <Link href="/import">
              <Upload />
              가져오기
            </Link>
          </Button>
          <InvestorFormDialog
            trigger={
              <Button>
                <Plus />
                투자사
              </Button>
            }
            users={teamUsers}
            currentUserId={me?.id ?? ""}
          />
        </div>
      </div>

      {rows.length === 0 ? (
        <Card className="items-center justify-center py-16 text-center">
          <p className="text-sm text-muted-foreground">
            아직 등록된 투자사가 없습니다. 오른쪽 위 “투자사” 버튼으로 첫 투자사를
            등록하세요.
          </p>
        </Card>
      ) : (
        <Card className="p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th className="px-4 py-2.5 font-medium">투자사명</th>
                <th className="px-4 py-2.5 font-medium">유형</th>
                <th className="px-4 py-2.5 font-medium">담당</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((inv) => (
                <tr
                  key={inv.id}
                  className="border-b border-border last:border-0 hover:bg-muted/40"
                >
                  <td className="px-4 py-3">
                    <Link
                      href={`/investors/${inv.id}`}
                      className="font-medium text-foreground hover:text-primary hover:underline"
                    >
                      {inv.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    {inv.type ? (
                      <Badge variant="outline">{inv.type}</Badge>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {inv.owner?.name ?? inv.owner?.email ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
