"use client";

import Link from "next/link";

import { Button } from "@/components/ui/button";
import {
  ImportWizard,
  type ImportField,
  type ImportRunResult,
} from "@/components/app/import-wizard";
import { importContacts, type ContactImportResult } from "../actions";

const NONE = "__none__";

const FIELDS: ImportField[] = [
  { key: "company", label: "회사·소속 (동명이인 구분)" },
  { key: "name", label: "이름 (검색 키)", required: true },
  { key: "title", label: "직함" },
  { key: "email", label: "전자 메일 주소" },
  { key: "mobile", label: "휴대폰" },
];

function autoMap(headers: string[]): Record<string, string> {
  const find = (...needles: string[]) =>
    headers.find((h) =>
      needles.some((n) => h.toLowerCase().includes(n.toLowerCase())),
    ) ?? NONE;
  return {
    company: find("회사", "기업", "소속", "company", "org"),
    name: find("이름", "성명", "name", "담당"),
    // 리멤버는 "직함" 컬럼 사용
    title: find("직함", "직위", "직책", "직급", "title", "position"),
    email: find("전자 메일", "이메일", "메일", "email", "e-mail"),
    mobile: find("휴대", "핸드폰", "모바일", "mobile", "cell"),
  };
}

function renderSummary(result: { ok: true } & Record<string, unknown>) {
  const s = (result as ContactImportResult & { ok: true }).summary;
  return (
    <>
      <ul className="text-muted-foreground">
        <li>신규 명함 {s.cardsCreated}건 적재</li>
        {s.duplicates > 0 && <li>중복 건너뜀 {s.duplicates}건</li>}
        {s.skipped > 0 && <li>건너뜀(이름 없음) {s.skipped}행</li>}
      </ul>
      <p className="text-xs text-muted-foreground">
        명함은 검색용 백데이터로 저장됩니다. 딜 등록·미팅 기록의 투자사 입력에서 이름으로
        검색해 자동으로 채울 수 있습니다.
      </p>
      <Button asChild size="sm" variant="outline">
        <Link href="/deals">딜 보드로 이동</Link>
      </Button>
    </>
  );
}

export function ContactImport() {
  return (
    <ImportWizard
      fields={FIELDS}
      autoMap={autoMap}
      requiredKey="name"
      unit="명함"
      placeholder={
        "회사,이름,직함,전자 메일 주소,휴대폰\n에이에스이티,박석정,대표이사,sj.park@aset.co.kr,010-5368-9225"
      }
      previewColumns={[
        { key: "company", label: "회사" },
        { key: "name", label: "이름" },
        { key: "title", label: "직함" },
        { key: "email", label: "전자 메일 주소" },
        { key: "mobile", label: "휴대폰" },
      ]}
      template={{
        filename: "명함_등록_양식.csv",
        headers: ["회사", "이름", "직함", "전자 메일 주소", "휴대폰"],
        example: [
          "에이에스이티",
          "박석정",
          "대표이사 / 공학박사",
          "sj.park@aset.co.kr",
          "010-5368-9225",
        ],
      }}
      run={(rows) => importContacts(rows) as Promise<ImportRunResult>}
      renderSummary={renderSummary}
    />
  );
}
