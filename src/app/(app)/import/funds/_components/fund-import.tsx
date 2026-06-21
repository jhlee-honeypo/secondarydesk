"use client";

import Link from "next/link";

import { Button } from "@/components/ui/button";
import {
  ImportWizard,
  type ImportField,
  type ImportRunResult,
} from "@/components/app/import-wizard";
import { importFunds, type FundImportResult } from "../actions";

const NONE = "__none__";

const FIELDS: ImportField[] = [
  { key: "oper_inst_nm", label: "회사명(운용사)", required: true },
  { key: "oper_inst_id", label: "운용사ID (투자사 식별 키)" },
  { key: "asct_nm", label: "조합명", required: true },
  { key: "reg_date", label: "등록일 → 결성일" },
  { key: "aum", label: "결성총액(원)" },
  { key: "maturity_date", label: "만기일" },
  { key: "invst_fld", label: "투자분야 → 섹터" },
  { key: "purpose", label: "목적구분" },
  { key: "diva_asct_id", label: "조합ID (멱등 키)" },
];

function autoMap(headers: string[]): Record<string, string> {
  const find = (...needles: string[]) =>
    headers.find((h) =>
      needles.some((n) => h.toLowerCase().includes(n.toLowerCase())),
    ) ?? NONE;
  return {
    oper_inst_nm: find("회사", "운용사명"),
    oper_inst_id: find("운용사id", "운용사 id", "operinstid"),
    asct_nm: find("조합명", "조합 명", "펀드명"),
    reg_date: find("등록일", "결성일", "등록"),
    aum: find("결성총액", "결성", "총액", "aum", "약정"),
    maturity_date: find("만기", "maturity"),
    invst_fld: find("투자분야", "분야", "섹터", "sector"),
    purpose: find("목적", "purpose"),
    diva_asct_id: find("조합id", "asct", "조합 id"),
  };
}

function renderSummary(result: { ok: true } & Record<string, unknown>) {
  const s = (result as FundImportResult & { ok: true }).summary;
  return (
    <>
      <ul className="text-muted-foreground">
        <li>
          투자사: 신규 {s.investorsCreated}곳 · 기존 매칭 {s.investorsMatched}곳
        </li>
        <li>
          조합: 신규 {s.fundsCreated}개 · 갱신 {s.fundsUpdated}개
        </li>
        {s.skipped > 0 && (
          <li>건너뜀(조합명·운용사 없음) {s.skipped}행</li>
        )}
      </ul>
      <Button asChild size="sm" variant="outline">
        <Link href="/investors">투자사 목록 보기</Link>
      </Button>
    </>
  );
}

export function FundImport() {
  return (
    <ImportWizard
      fields={FIELDS}
      autoMap={autoMap}
      requiredKey="asct_nm"
      unit="조합"
      placeholder={
        "회사명,조합명,등록일,결성총액,만기일,투자분야,목적구분,조합ID,운용사ID\n키움인베스트먼트,키움 1호 벤처투자조합,2023-07-18,25253000000,2033-07-17,일반/바이오,해당없음,AS20230619,OP19990010"
      }
      previewColumns={[
        { key: "oper_inst_nm", label: "회사명(운용사)" },
        { key: "asct_nm", label: "조합명" },
        { key: "reg_date", label: "등록일" },
        { key: "aum", label: "결성총액" },
        { key: "maturity_date", label: "만기일" },
      ]}
      template={{
        filename: "DIVA_조합_가져오기_양식.csv",
        headers: [
          "회사명",
          "조합명",
          "등록일",
          "결성총액",
          "만기일",
          "투자분야",
          "목적구분",
          "지원구분",
          "조합ID",
          "운용사ID",
        ],
        example: [
          "키움인베스트먼트",
          "키움 1호 벤처투자조합",
          "2023-07-18",
          "25253000000",
          "2033-07-17",
          "일반/바이오",
          "해당없음",
          "창업초기",
          "AS20230619",
          "OP19990010",
        ],
      }}
      run={(rows) => importFunds(rows) as Promise<ImportRunResult>}
      renderSummary={renderSummary}
    />
  );
}
