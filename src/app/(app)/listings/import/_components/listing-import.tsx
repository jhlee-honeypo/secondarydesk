"use client";

import Link from "next/link";

import { Button } from "@/components/ui/button";
import {
  ImportWizard,
  type ImportField,
  type ImportRunResult,
} from "@/components/app/import-wizard";
import { importListings, type ListingImportResult } from "../actions";

const NONE = "__none__";

const FIELDS: ImportField[] = [
  { key: "company_name", label: "회사명", required: true },
  { key: "status", label: "상태 (세일즈중/거래완료/보류)" },
  { key: "sector", label: "섹터" },
  { key: "stage", label: "투자 단계 (Series A 등)" },
  { key: "asking_valuation", label: "최신 라운드 밸류" },
  { key: "summary", label: "개요·메모" },
  { key: "deck_url", label: "자료 링크" },
  { key: "fund_names", label: "소속 운용펀드 (쉼표로 여러 개)" },
];

function autoMap(headers: string[]): Record<string, string> {
  const find = (...needles: string[]) =>
    headers.find((h) =>
      needles.some((n) => h.toLowerCase().includes(n.toLowerCase())),
    ) ?? NONE;
  return {
    company_name: find("회사", "기업", "매물", "company", "name", "종목"),
    status: find("상태", "status"),
    sector: find("섹터", "산업", "업종", "sector"),
    stage: find("단계", "라운드", "stage", "series"),
    asking_valuation: find("밸류", "valuation", "가치", "금액"),
    summary: find("개요", "메모", "설명", "summary", "비고"),
    deck_url: find("링크", "자료", "deck", "url", "ir"),
    fund_names: find("운용펀드", "펀드", "조합", "fund"),
  };
}

function renderSummary(result: { ok: true } & Record<string, unknown>) {
  const s = (result as ListingImportResult & { ok: true }).summary;
  return (
    <>
      <ul className="text-muted-foreground">
        <li>신규 매물 {s.created}개</li>
        {s.updated > 0 && <li>기존 매물에 조합 추가 {s.updated}개</li>}
        <li>운용펀드 태그 연결 {s.fundLinks}건</li>
        {s.skipped > 0 && <li>건너뜀(회사명 없음) {s.skipped}행</li>}
        {s.unmatchedFunds.length > 0 && (
          <li className="text-amber-600 dark:text-amber-500">
            매칭 실패 운용펀드: {s.unmatchedFunds.join(", ")} (이름이 정확한지
            확인하세요)
          </li>
        )}
      </ul>
      <Button asChild size="sm" variant="outline">
        <Link href="/listings">매물 목록 보기</Link>
      </Button>
    </>
  );
}

export function ListingImport() {
  return (
    <ImportWizard
      fields={FIELDS}
      autoMap={autoMap}
      requiredKey="company_name"
      unit="매물"
      placeholder={
        "회사명,상태,섹터,최신 라운드 밸류,소속 운용펀드\n예시컴퍼니,세일즈중,헬스케어/바이오,50000000000,스파크 1호 조합"
      }
      previewColumns={[
        { key: "company_name", label: "회사명" },
        { key: "status", label: "상태" },
        { key: "sector", label: "섹터" },
        { key: "asking_valuation", label: "최신 밸류" },
        { key: "fund_names", label: "운용펀드" },
      ]}
      template={{
        filename: "매물_가져오기_양식.csv",
        headers: [
          "회사명",
          "상태",
          "섹터",
          "투자 단계",
          "최신 라운드 밸류",
          "개요",
          "자료 링크",
          "소속 운용펀드",
        ],
        example: [
          "예시컴퍼니",
          "세일즈중",
          "헬스케어/바이오",
          "Series B",
          "50000000000",
          "흑자전환 임박, 구주 매각 희망",
          "https://example.com/deck",
          "스파크 1호 조합",
        ],
      }}
      run={(rows) =>
        importListings(rows) as Promise<ImportRunResult>
      }
      renderSummary={renderSummary}
    />
  );
}
