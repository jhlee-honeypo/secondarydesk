import Link from "next/link";

import { ContactImport } from "./_components/contact-import";

export const dynamic = "force-dynamic";

export default function ContactImportPage() {
  return (
    <div className="mx-auto w-full max-w-3xl space-y-6">
      <Link
        href="/investors"
        className="text-sm text-muted-foreground hover:text-foreground"
      >
        ← 투자사 목록
      </Link>

      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">명함 등록</h1>
        <p className="text-sm text-muted-foreground">
          리멤버 등에서 내보낸 명함 엑셀·CSV를 <strong>검색용 백데이터</strong>로 저장합니다.
          투자사·컨택을 바로 만들지 않습니다. 딜 등록·미팅 기록에서 투자사를 입력할 때
          이름으로 검색하면, 동명이인은 소속으로 구분해 고르고 폼이 자동으로 채워집니다.
        </p>
      </div>

      <ContactImport />
    </div>
  );
}
