"use client";

import { useMemo } from "react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import {
  ImportWizard,
  type ImportField,
  type ImportRunResult,
} from "@/components/app/import-wizard";
import { normName, splitNames } from "@/lib/normalize";
import { importDeals, type DealImportResult } from "../actions";

const NONE = "__none__";

const FIELDS: ImportField[] = [
  { key: "listing_name", label: "매물명(포트폴리오사) — 여러 개는 ;로 구분" },
  { key: "bundle_name", label: "즐겨찾기 묶음명 (매물 일괄)" },
  { key: "investor_name", label: "투자사명", required: true },
  { key: "met_date", label: "일자 (투자사 만난 일자)" },
  { key: "contact_name", label: "컨택 심사역" },
  { key: "contact_title", label: "직책 (비우면 명함에서 채움)" },
  { key: "contact_email", label: "이메일 (비우면 명함에서 채움)" },
  { key: "contact_phone", label: "휴대폰 (비우면 명함에서 채움)" },
  { key: "investor_description", label: "개요·성향 메모" },
  { key: "fund_name", label: "조합명" },
  { key: "fund_main_purpose", label: "주목적" },
  { key: "fund_notes", label: "비고" },
  { key: "stage", label: "단계 (컨택/기업소개/IR·실사/클로징/드랍)" },
  { key: "stage_date", label: "단계 진입일자" },
  { key: "lost_reason", label: "드랍 사유 (단계가 드랍일 때만 저장)" },
];

function autoMap(headers: string[]): Record<string, string> {
  const find = (...needles: string[]) =>
    headers.find((h) =>
      needles.some((n) => h.toLowerCase().includes(n.toLowerCase())),
    ) ?? NONE;
  return {
    listing_name: find("매물", "회사", "기업", "종목", "포트폴리오", "대상", "company"),
    bundle_name: find("묶음", "즐겨찾기", "bundle"),
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
    lost_reason: find("드랍", "드롭", "drop", "사유", "탈락"),
  };
}

function renderSummary(result: { ok: true } & Record<string, unknown>) {
  const s = (result as DealImportResult & { ok: true }).summary;
  return (
    <>
      <ul className="text-muted-foreground">
        <li>생성된 딜 {s.created}개</li>
        {(s.investorsCreated > 0 || s.fundsCreated > 0) && (
          <li>
            새 투자사 {s.investorsCreated} · 조합 {s.fundsCreated}
          </li>
        )}
        {s.contactsCreated > 0 && (
          <li>
            새 컨택 {s.contactsCreated}개
            {s.contactsFromCard > 0 && (
              <> (명함에서 {s.contactsFromCard}개 자동 채움)</>
            )}
          </li>
        )}
        {s.contactsNoInfo.length > 0 && (
          <li className="text-amber-600 dark:text-amber-500">
            연락처 못 채운 컨택 {s.contactsNoInfo.length}건 —{" "}
            {s.contactsNoInfo.join(", ")}
            <br />
            (명함에 없어 이름만 등록됨 — 투자사 화면에서 이메일·휴대폰을 직접
            입력하세요)
          </li>
        )}
        {s.skippedDup > 0 && <li>건너뜀(이미 있는 딜) {s.skippedDup}건</li>}
        {s.skippedNoData > 0 && (
          <li>건너뜀(투자사 또는 매물·묶음 누락) {s.skippedNoData}행</li>
        )}
        {s.skippedNoListing > 0 && (
          <li className="text-amber-600 dark:text-amber-500">
            건너뜀(매물 미등록) {s.skippedNoListing}건 —{" "}
            {s.unmatchedListings.join(", ")}
            <br />
            (이 매물들을 먼저 등록한 뒤 다시 가져오면 딜이 생성됩니다)
          </li>
        )}
        {s.unmatchedBundles.length > 0 && (
          <li className="text-amber-600 dark:text-amber-500">
            못 찾은 즐겨찾기 묶음 {s.unmatchedBundles.length}개 —{" "}
            {s.unmatchedBundles.join(", ")}
            <br />
            (묶음 이름을 딜 보드의 저장된 묶음명과 정확히 맞춰주세요)
          </li>
        )}
      </ul>
      <Button asChild size="sm" variant="outline">
        <Link href="/deals">딜 보드 보기</Link>
      </Button>
    </>
  );
}

export function DealImport({
  bundles = [],
  listings = [],
}: {
  /** 즐겨찾기 묶음(이름→매물 id) — 펼친 딜 수 미리보기용. */
  bundles?: { name: string; listing_ids: string[] }[];
  /** 등록된 매물(id·회사명) — 묶음·매물명 매칭으로 펼친 수 추정. */
  listings?: { id: string; company_name: string }[];
}) {
  // 실행 전 '펼쳐진 실제 딜 수' 추정. 서버 importDeals 와 동일한 정규화·합집합
  // 규칙을 쓰되, 기존 딜과의 중복은 알 수 없어 approx(최대)로 표기한다.
  const estimate = useMemo(() => {
    const validIds = new Set(listings.map((l) => l.id));
    const listingByNorm = new Map(
      listings.map((l) => [normName(l.company_name), l.id] as const),
    );
    const bundleByNorm = new Map(
      bundles.map((b) => [normName(b.name), b.listing_ids] as const),
    );
    return (rows: Record<string, string>[]) => {
      const pairs = new Set<string>();
      for (const r of rows) {
        const investor = (r.investor_name ?? "").trim();
        const bundleName = (r.bundle_name ?? "").trim();
        const names = splitNames(r.listing_name);
        if (!investor || (!bundleName && names.length === 0)) continue;
        const ids = new Set<string>();
        if (bundleName) {
          const bIds = bundleByNorm.get(normName(bundleName));
          if (bIds) for (const id of bIds) if (validIds.has(id)) ids.add(id);
        }
        for (const n of names) {
          const id = listingByNorm.get(normName(n));
          if (id) ids.add(id);
        }
        const inv = normName(investor);
        for (const id of ids) pairs.add(`${inv}:${id}`);
      }
      return { count: pairs.size, approx: true };
    };
  }, [bundles, listings]);

  return (
    <ImportWizard
      fields={FIELDS}
      autoMap={autoMap}
      requiredKey="investor_name"
      unit="딜"
      estimate={estimate}
      placeholder={
        "매물명,즐겨찾기묶음명,투자사명,일자,컨택심사역,직책,이메일,휴대폰,개요성향메모,조합명,주목적,비고,단계,단계진입일자,드랍사유\n예시컴퍼니,,예시벤처스,2026-03-10,김심사,팀장,kim@example.com,010-1234-5678,구주 적극 검토,스파크 1호 조합,초기기업 투자,후속 가능,기업소개,2026-03-15,\nA사;B사;C사,,키로스벤처스,2026-04-01,,,,,,,,,기업소개,,\n,농식품패키지,넥스트지인,2026-04-01,,,,,,,,,드랍,,펀드 부적합(시리즈 C 이상 선호)"
      }
      previewColumns={[
        { key: "listing_name", label: "매물" },
        { key: "bundle_name", label: "묶음" },
        { key: "investor_name", label: "투자사" },
        { key: "contact_name", label: "컨택" },
        { key: "fund_name", label: "조합" },
        { key: "stage", label: "단계" },
      ]}
      template={{
        filename: "딜_가져오기_양식.csv",
        headers: [
          "매물명",
          "즐겨찾기묶음명",
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
          "드랍사유",
        ],
        example: [
          "예시컴퍼니",
          "",
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
          "",
        ],
      }}
      run={(rows) => importDeals(rows) as Promise<ImportRunResult>}
      renderSummary={renderSummary}
    />
  );
}
