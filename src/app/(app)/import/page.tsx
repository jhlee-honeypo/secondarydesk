import Link from "next/link";

import { ImportWizard } from "./_components/import-wizard";

export const dynamic = "force-dynamic";

export default function ImportPage() {
  return (
    <div className="mx-auto w-full max-w-3xl space-y-6">
      <Link
        href="/investors"
        className="text-sm text-muted-foreground hover:text-foreground"
      >
        ← 투자사 목록
      </Link>

      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">데이터 가져오기</h1>
        <p className="text-sm text-muted-foreground">
          기존 스프레드시트(투자사·조합)를 CSV로 일괄 등록합니다. 같은 이름의
          투자사는 한 번만 생성되고, 조합은 해당 투자사에 연결됩니다.
        </p>
      </div>

      <ImportWizard />

      <p className="text-sm text-muted-foreground">
        벤처캐피탈협회 전자공시(DIVA) 조합 목록을 가져오려면{" "}
        <Link href="/import/funds" className="text-primary hover:underline">
          DIVA 조합 가져오기
        </Link>
        를 이용하세요.
      </p>
    </div>
  );
}
