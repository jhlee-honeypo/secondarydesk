import Link from "next/link";

import { ListingImport } from "./_components/listing-import";

export const dynamic = "force-dynamic";

export default function ListingImportPage() {
  return (
    <div className="mx-auto w-full max-w-3xl space-y-6">
      <Link
        href="/listings"
        className="text-sm text-muted-foreground hover:text-foreground"
      >
        ← 매물 목록
      </Link>

      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">매물 가져오기</h1>
        <p className="text-sm text-muted-foreground">
          엑셀·CSV로 매물(구주)을 한 번에 등록합니다. 이미 등록된 회사명은 새로
          만들지 않고 “소속 운용펀드” 컬럼의 조합만 추가로 연결합니다(한 매물이 여러
          조합에 속할 수 있음). 운용펀드는 이름이 기존 운용펀드와 일치할 때 태깅됩니다.
        </p>
      </div>

      <ListingImport />
    </div>
  );
}
