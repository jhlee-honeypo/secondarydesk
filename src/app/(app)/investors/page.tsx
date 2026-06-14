import Link from "next/link";
import { Contact, Upload } from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { InvestorTable } from "./_components/investor-table";

export const dynamic = "force-dynamic";

export default async function InvestorsPage() {
  const supabase = await createClient();

  // 투자사별 조합(funds)·딜을 임베드해 조합 수·결성총액 합·매칭 딜 수를 집계한다.
  const { data: investors } = await supabase
    .from("investors")
    .select("id, name, funds(aum), deals(id)");

  const data = (investors ?? []) as unknown as {
    id: string;
    name: string;
    funds: { aum: number | null }[] | null;
    deals: { id: string }[] | null;
  }[];
  const rows = data
    .map((inv) => ({
      id: inv.id,
      name: inv.name,
      fundCount: inv.funds?.length ?? 0,
      aumSum: (inv.funds ?? []).reduce((s, f) => s + (f.aum ?? 0), 0),
      dealCount: inv.deals?.length ?? 0,
    }))
    // 매칭 딜 많은 순 → 같은 건수(특히 0건)는 결성총액 큰 순
    .sort((a, b) => b.dealCount - a.dealCount || b.aumSum - a.aumSum);

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">투자사</h1>
          <p className="text-sm text-muted-foreground">
            딜 보드의 “새 딜 생성”에서 등록한 투자사가 여기에 모입니다. 상세에서
            조합·컨택을 관리합니다.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" asChild>
            <Link href="/import/contacts">
              <Contact />
              명함 등록
            </Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href="/import">
              <Upload />
              가져오기
            </Link>
          </Button>
        </div>
      </div>

      {rows.length === 0 ? (
        <Card className="items-center justify-center py-16 text-center">
          <p className="text-sm text-muted-foreground">
            아직 등록된 투자사가 없습니다. 딜 보드의 “새 딜 생성”에서 새 투자사를
            등록하거나, “가져오기”로 일괄 등록하세요.
          </p>
        </Card>
      ) : (
        <InvestorTable rows={rows} />
      )}
    </div>
  );
}
