import Link from "next/link";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getDivaMatchData } from "./actions";
import { FundImport } from "./_components/fund-import";
import { DivaMatch } from "./_components/diva-match";

export const dynamic = "force-dynamic";

export default async function FundImportPage() {
  const match = await getDivaMatchData();

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6">
      <Link
        href="/investors"
        className="text-sm text-muted-foreground hover:text-foreground"
      >
        ← 투자사 목록
      </Link>

      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">
          DIVA 조합 가져오기
        </h1>
        <p className="text-sm text-muted-foreground">
          벤처캐피탈협회 전자공시(DIVA)에서 받은 조합 목록(CSV)을 올립니다.
          운용사(GP)는 운용사ID로 식별해 기존 투자사면 매칭하고 없으면 새 투자사로
          등록합니다. 공동GP 조합은 각 운용사 아래에 한 건씩 붙으며, 같은 회사는
          ID로 식별돼 중복 생성되지 않습니다. 조합ID로 재업로드 시 중복 없이
          갱신되고, 직접 입력한 항목(드라이파우더·구주 선호도·메모)은 보존됩니다.
        </p>
      </div>

      <FundImport />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">기존 투자사 수기 매칭</CardTitle>
        </CardHeader>
        <CardContent>
          <DivaMatch
            unmatched={match.unmatched}
            divaOptions={match.divaOptions}
          />
        </CardContent>
      </Card>
    </div>
  );
}
