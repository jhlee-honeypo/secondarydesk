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
    </div>
  );
}
