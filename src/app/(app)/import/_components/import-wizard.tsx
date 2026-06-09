"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { CheckCircle2, FileUp, Upload } from "lucide-react";

import { parseCsv, type ParsedCsv } from "@/lib/csv";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Field } from "@/components/app/field";
import { importInvestors, type ImportResult, type ImportRow } from "../actions";

const NONE = "__none__";

const FIELDS: { key: keyof ImportRow; label: string; required?: boolean }[] = [
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

// 헤더명으로 대략 자동 매핑
function autoMap(headers: string[]): Record<string, string> {
  const guess: Record<string, string> = {};
  const find = (...needles: string[]) =>
    headers.find((h) =>
      needles.some((n) => h.toLowerCase().includes(n.toLowerCase())),
    ) ?? NONE;
  guess.name = find("투자사", "회사", "name", "기관");
  guess.type = find("유형", "type");
  guess.tier = find("tier", "등급");
  guess.website = find("web", "url", "홈페이지", "사이트");
  guess.description = find("개요", "메모", "설명", "desc");
  guess.fund_name = find("조합", "펀드", "fund");
  guess.fund_dry_powder = find("드라이", "powder", "재원");
  guess.fund_maturity_date = find("만기");
  guess.fund_main_purpose = find("주목적", "목적", "purpose");
  guess.fund_secondary_appetite = find("선호", "appetite", "구주");
  return guess;
}

export function ImportWizard() {
  const [raw, setRaw] = useState("");
  const [parsed, setParsed] = useState<ParsedCsv | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [result, setResult] = useState<ImportResult | null>(null);
  const [pending, startTransition] = useTransition();

  function handleParse(text: string) {
    const p = parseCsv(text);
    setParsed(p);
    setMapping(autoMap(p.headers));
    setResult(null);
  }

  function handleFile(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result ?? "");
      setRaw(text);
      handleParse(text);
    };
    reader.readAsText(file);
  }

  function buildRows(): ImportRow[] {
    if (!parsed) return [];
    const idx = (field: string) => {
      const h = mapping[field];
      return h && h !== NONE ? parsed.headers.indexOf(h) : -1;
    };
    const fieldIdx = Object.fromEntries(
      FIELDS.map((f) => [f.key, idx(f.key as string)]),
    ) as Record<string, number>;

    return parsed.rows.map((r) => {
      const row: ImportRow = {};
      for (const f of FIELDS) {
        const i = fieldIdx[f.key as string];
        if (i >= 0) row[f.key] = (r[i] ?? "").trim();
      }
      return row;
    });
  }

  const nameMapped = mapping.name && mapping.name !== NONE;
  const rows = parsed ? buildRows() : [];
  const importable = rows.filter((r) => r.name && r.name.trim() !== "").length;

  function handleImport() {
    setResult(null);
    startTransition(async () => {
      const res = await importInvestors(buildRows());
      setResult(res);
    });
  }

  return (
    <div className="space-y-6">
      {/* 1. 입력 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">1. CSV 불러오기</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <label className="flex w-fit cursor-pointer items-center gap-2 rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-xs hover:bg-muted/40">
            <FileUp className="size-4" />
            CSV 파일 선택
            <input
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFile(f);
              }}
            />
          </label>
          <p className="text-xs text-muted-foreground">
            또는 첫 줄을 헤더로 하는 CSV를 아래에 붙여넣으세요. (엑셀은 “CSV로
            저장” 후 사용)
          </p>
          <Textarea
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
            rows={5}
            placeholder={"투자사명,유형,조합명,드라이파우더\n예시벤처스,VC,예시1호,30000000000"}
            className="font-mono text-xs"
          />
          <Button
            type="button"
            variant="outline"
            disabled={!raw.trim()}
            onClick={() => handleParse(raw)}
          >
            <Upload />
            붙여넣은 내용 파싱
          </Button>
        </CardContent>
      </Card>

      {/* 2. 매핑 */}
      {parsed && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              2. 컬럼 매핑{" "}
              <span className="text-sm font-normal text-muted-foreground">
                (행 {parsed.rows.length}개 · 헤더 {parsed.headers.length}개)
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            {FIELDS.map((f) => (
              <Field
                key={f.key as string}
                label={f.label}
                required={f.required}
              >
                <Select
                  value={mapping[f.key as string] ?? NONE}
                  onValueChange={(v) =>
                    setMapping((m) => ({ ...m, [f.key as string]: v }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="CSV 컬럼 선택" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>— 사용 안 함 —</SelectItem>
                    {parsed.headers.map((h, i) => (
                      <SelectItem key={`${h}-${i}`} value={h}>
                        {h || `(빈 헤더 ${i + 1})`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            ))}
          </CardContent>
        </Card>
      )}

      {/* 3. 미리보기 + 실행 */}
      {parsed && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">3. 미리보기 &amp; 가져오기</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {!nameMapped && (
              <p className="text-sm text-destructive">
                “투자사명”을 CSV 컬럼에 매핑해야 가져올 수 있습니다.
              </p>
            )}

            {nameMapped && (
              <div className="overflow-x-auto rounded-lg border border-border">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border bg-muted/40 text-left text-muted-foreground">
                      <th className="px-3 py-2 font-medium">투자사명</th>
                      <th className="px-3 py-2 font-medium">유형</th>
                      <th className="px-3 py-2 font-medium">조합명</th>
                      <th className="px-3 py-2 font-medium">드라이파우더</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.slice(0, 5).map((r, i) => (
                      <tr key={i} className="border-b border-border last:border-0">
                        <td className="px-3 py-1.5">{r.name || "—"}</td>
                        <td className="px-3 py-1.5">{r.type || "—"}</td>
                        <td className="px-3 py-1.5">{r.fund_name || "—"}</td>
                        <td className="px-3 py-1.5">
                          {r.fund_dry_powder || "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {rows.length > 5 && (
                  <p className="px-3 py-1.5 text-muted-foreground">
                    … 외 {rows.length - 5}행
                  </p>
                )}
              </div>
            )}

            <div className="flex items-center gap-3">
              <Button
                type="button"
                disabled={!nameMapped || importable === 0 || pending}
                onClick={handleImport}
              >
                {pending
                  ? "가져오는 중…"
                  : `${importable}개 투자사 가져오기`}
              </Button>
              {importable === 0 && nameMapped && (
                <span className="text-sm text-muted-foreground">
                  투자사명이 채워진 행이 없습니다.
                </span>
              )}
            </div>

            {result && !result.ok && (
              <p className="text-sm text-destructive" role="alert">
                {result.error}
              </p>
            )}
            {result && result.ok && (
              <div className="space-y-2 rounded-lg border border-border bg-muted/30 p-4 text-sm">
                <p className="flex items-center gap-2 font-medium text-foreground">
                  <CheckCircle2 className="size-4 text-primary" />
                  가져오기 완료
                </p>
                <ul className="text-muted-foreground">
                  <li>신규 투자사 {result.summary.investorsCreated}개</li>
                  <li>기존 투자사 재사용 {result.summary.investorsReused}개</li>
                  <li>조합 {result.summary.fundsCreated}개</li>
                  {result.summary.skipped > 0 && (
                    <li>건너뜀(투자사명 없음) {result.summary.skipped}행</li>
                  )}
                </ul>
                <Button asChild size="sm" variant="outline">
                  <Link href="/investors">투자사 목록 보기</Link>
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
