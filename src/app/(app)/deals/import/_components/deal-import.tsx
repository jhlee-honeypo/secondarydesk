"use client";

import Link from "next/link";

import { Button } from "@/components/ui/button";
import {
  ImportWizard,
  type ImportField,
  type ImportRunResult,
} from "@/components/app/import-wizard";
import { importDeals, type DealImportResult } from "../actions";

const NONE = "__none__";

const FIELDS: ImportField[] = [
  { key: "listing_name", label: "매물명(포트폴리오사)", required: true },
  { key: "investor_name", label: "투자사명", required: true },
  { key: "met_date", label: "일자 (투자사 만난 일자)" },
  { key: "contact_name", label: "컨택 심사역" },
  { key: "contact_title", label: "직책" },
  { key: "contact_email", label: "이메일" },
  { key: "contact_phone", label: "휴대폰" },
  { key: "investor_description", label: "개요·성향 메모" },
  { key: "fund_name", label: "조합명" },
  { key: "fund_main_purpose", label: "주목적" },
  { key: "fund_notes", label: "비고" },
  { key: "stage", label: "단계 (컨택/기업소개/IR·실사/클로징/드랍)" },
  { key: "stage_date", label: "단계 진입일자" },
];

function autoMap(headers: string[]): Record<string, string> {
  const find = (...needles: string[]) =>
    headers.find((h) =>
      needles.some((n) => h.toLowerCase().includes(n.toLowerCase())),
    ) ?? NONE;
  return {
    listing_name: find("매물", "회사", "기업", "종목", "포트폴리오", "대상", "company"),
    investor_name: find("투자사", "투자자", "기관", "운용사", "매수", "investor"),
    met_date: find("만난", "미팅", "일자"),
    contact_name: find("심사역", "컨택", "담당자", "성명", "contact"),
    contact_title: find("직책", "직위", "직함", "title"),
    contact_email: find("이메일", "메일", "email"),
    contact_phone: find("휴대폰", "핸드폰", "전화", "연락처", "phone"),
    investor_description: find("개요", "성향", "소개"),
    fund_name: find("조합", "펀드", "fund"),
    fund_main_purpose: find("주목적", "목적", "purpose"),
    fund_notes: find("비고", "노트", "기타", "note"),
    stage: find("단계", "stage", "진행"),
    stage_date: find("단계진입", "진입일", "진입"),
  };
}

function renderSummary(result: { ok: true } & Record<string, unknown>) {
  const s = (result as DealImportResult & { ok: true }).summary;
  return (
    <>
      <ul className="text-muted-foreground">
        <li>생성된 딜 {s.created}개</li>
        {s.investorsCreated > 0 && (
          <li>
            새 투자사 {s.investorsCreated} · 컨택 {s.contactsCreated} · 조합{" "}
            {s.fundsCreated}
          </li>
        )}
        {s.skippedDup > 0 && <li>건너뜀(이미 있는 딜) {s.skippedDup}건</li>}
        {s.skippedNoData > 0 && (
          <li>건너뜀(투자사·매물명 누락) {s.skippedNoData}행</li>
        )}
        {s.skippedNoListing > 0 && (
          <li className="text-amber-600 dark:text-amber-500">
            건너뜀(매물 미등록) {s.skippedNoListing}행 —{" "}
            {s.unmatchedListings.join(", ")}
            <br />
            (이 매물들을 먼저 등록한 뒤 다시 가져오면 딜이 생성됩니다)
          </li>
        )}
      </ul>
      <Button asChild size="sm" variant="outline">
        <Link href="/deals">딜 보드 보기</Link>
      </Button>
    </>
  );
}

export function DealImport() {
  return (
    <ImportWizard
      fields={FIELDS}
      autoMap={autoMap}
      requiredKey="investor_name"
      unit="딜"
      placeholder={
        "매물명,투자사명,일자,컨택심사역,직책,이메일,휴대폰,개요성향메모,조합명,주목적,비고,단계,단계진입일자\n예시컴퍼니,예시벤처스,2026-03-10,김심사,팀장,kim@example.com,010-1234-5678,구주 적극 검토,스파크 1호 조합,초기기업 투자,후속 가능,기업소개,2026-03-15"
      }
      previewColumns={[
        { key: "listing_name", label: "매물" },
        { key: "investor_name", label: "투자사" },
        { key: "contact_name", label: "컨택" },
        { key: "fund_name", label: "조합" },
        { key: "stage", label: "단계" },
      ]}
      template={{
        filename: "딜_가져오기_양식.csv",
        headers: [
          "매물명",
          "투자사명",
          "일자",
          "컨택심사역",
          "직책",
          "이메일",
          "휴대폰",
          "개요성향메모",
          "조합명",
          "주목적",
          "비고",
          "단계",
          "단계진입일자",
        ],
        example: [
          "예시컴퍼니",
          "예시벤처스",
          "2026-03-10",
          "김심사",
          "팀장",
          "kim@example.com",
          "010-1234-5678",
          "구주 적극 검토 중",
          "스파크 1호 조합",
          "초기기업 투자",
          "후속 출자 가능",
          "기업소개",
          "2026-03-15",
        ],
      }}
      run={(rows) => importDeals(rows) as Promise<ImportRunResult>}
      renderSummary={renderSummary}
    />
  );
}
