import Link from "next/link";

import { DealImport } from "./_components/deal-import";

export const dynamic = "force-dynamic";

export default function DealImportPage() {
  return (
    <div className="mx-auto w-full max-w-3xl space-y-6">
      <Link
        href="/deals"
        className="text-sm text-muted-foreground hover:text-foreground"
      >
        ← 딜 보드
      </Link>

      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">딜 가져오기</h1>
        <p className="text-sm text-muted-foreground">
          엑셀·CSV로 딜을 한 번에 등록합니다. 투자사는 이름으로 매칭하고, 없으면
          “새 딜 생성 → 새 투자사 등록”과 동일하게 투자사(메모·만난일자)+컨택(심사역·
          직책·이메일·휴대폰)+조합(조합명·주목적·비고)을 함께 생성합니다(기존 투자사면
          딜만 추가). 매물은 등록된 것만 연결하고 시트에만 있는 매물은 건너뛰고 요약에
          보고합니다(먼저 매물을 등록한 뒤 다시 가져오세요). 같은 매물×투자사 딜이
          이미 있으면 건너뜁니다.
        </p>
      </div>

      <DealImport />
    </div>
  );
}
