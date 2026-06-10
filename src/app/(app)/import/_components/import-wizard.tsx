"use client";

import Link from "next/link";

import { Button } from "@/components/ui/button";
import {
  ImportWizard as GenericImportWizard,
  type ImportField,
  type ImportRunResult,
} from "@/components/app/import-wizard";
import { importInvestors, type ImportResult } from "../actions";

const NONE = "__none__";

const FIELDS: ImportField[] = [
  { key: "name", label: "투자사명", required: true },
  { key: "type", label: "유형 (VC/CVC/PEF…)" },
  { key: "tier", label: "Tier (A/B/C)" },
  { key: "website", label: "웹사이트" },
  { key: "description", label: "개요·메모" },
  { key: "fund_name", label: "조합명" },
  { key: "fund_dry_powder", label: "드라이파우더" },
  { key: "fund_maturity_date", label: "조합 만기일 (YYYY-MM-DD)" },
  { key: "fund_main_purpose", label: "조합 주목적" },
  { key: "fund_secondary_appetite", label: "구주 선호도 (적극/가능…)" },
];

function autoMap(headers: string[]): Record<string, string> {
  const find = (...needles: string[]) =>
    headers.find((h) =>
      needles.some((n) => h.toLowerCase().includes(n.toLowerCase())),
    ) ?? NONE;
  return {
    name: find("투자사", "회사", "name", "기관"),
    type: find("유형", "type"),
    tier: find("tier", "등급"),
    website: find("web", "url", "홈페이지", "사이트"),
    description: find("개요", "메모", "설명", "desc"),
    fund_name: find("조합", "펀드", "fund"),
    fund_dry_powder: find("드라이", "powder", "재원"),
    fund_maturity_date: find("만기"),
    fund_main_purpose: find("주목적", "목적", "purpose"),
    fund_secondary_appetite: find("선호", "appetite", "구주"),
  };
}

function renderSummary(result: { ok: true } & Record<string, unknown>) {
  const s = (result as ImportResult & { ok: true }).summary;
  return (
    <>
      <ul className="text-muted-foreground">
        <li>신규 투자사 {s.investorsCreated}개</li>
        <li>기존 투자사 재사용 {s.investorsReused}개</li>
        <li>조합 {s.fundsCreated}개</li>
        {s.skipped > 0 && <li>건너뜀(투자사명 없음) {s.skipped}행</li>}
      </ul>
      <Button asChild size="sm" variant="outline">
        <Link href="/investors">투자사 목록 보기</Link>
      </Button>
    </>
  );
}

export function ImportWizard() {
  return (
    <GenericImportWizard
      fields={FIELDS}
      autoMap={autoMap}
      requiredKey="name"
      unit="투자사"
      placeholder={
        "투자사명,유형,조합명,드라이파우더\n예시벤처스,VC,예시1호,30000000000"
      }
      previewColumns={[
        { key: "name", label: "투자사명" },
        { key: "type", label: "유형" },
        { key: "fund_name", label: "조합명" },
        { key: "fund_dry_powder", label: "드라이파우더" },
      ]}
      template={{
        filename: "투자사_가져오기_양식.csv",
        headers: [
          "투자사명",
          "유형",
          "Tier",
          "웹사이트",
          "개요",
          "조합명",
          "드라이파우더",
          "조합 만기일",
          "조합 주목적",
          "구주 선호도",
        ],
        example: [
          "예시벤처스",
          "VC",
          "A",
          "https://example.com",
          "초기 기술기업 전문",
          "예시제1호 벤처투자조합",
          "30000000000",
          "2027-12-31",
          "초기 딥테크",
          "적극",
        ],
      }}
      run={(rows) => importInvestors(rows) as Promise<ImportRunResult>}
      renderSummary={renderSummary}
    />
  );
}
