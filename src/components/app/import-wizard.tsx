"use client";

import { useState, useTransition, type ReactNode } from "react";
import { CheckCircle2, Download, FileUp, Upload } from "lucide-react";

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

const NONE = "__none__";

export type ImportField = { key: string; label: string; required?: boolean };

// run()의 성공 결과는 ok:true + 임의 요약 필드. 실패는 ok:false + error.
export type ImportRunResult =
  | ({ ok: true } & Record<string, unknown>)
  | { ok: false; error: string };

export type ImportWizardConfig = {
  /** 매핑 가능한 대상 필드 목록 */
  fields: ImportField[];
  /** 헤더명 기반 자동 매핑 추론 */
  autoMap: (headers: string[]) => Record<string, string>;
  /** 반드시 매핑돼야 하는 키(예: 회사명) */
  requiredKey: string;
  /** 가져오기 단위 명칭(예: "매물") — 버튼 문구 등에 사용 */
  unit: string;
  /** 붙여넣기 placeholder 예시 */
  placeholder: string;
  /** 미리보기 표에 보일 컬럼 */
  previewColumns: { key: string; label: string }[];
  /** 샘플 양식 다운로드(헤더 + 예시 1행) */
  template: { filename: string; headers: string[]; example: string[] };
  /** 실제 가져오기 서버 액션 */
  run: (rows: Record<string, string>[]) => Promise<ImportRunResult>;
  /** 성공 요약 렌더러 */
  renderSummary: (result: { ok: true } & Record<string, unknown>) => ReactNode;
};

/**
 * CSV/엑셀(.xlsx) 파일 또는 붙여넣기로 표 데이터를 불러와 대상 필드에 매핑한 뒤
 * 일괄 등록하는 공용 마법사. 투자사·매물 등 여러 임포트에서 설정만 바꿔 재사용한다.
 */
export function ImportWizard(cfg: ImportWizardConfig) {
  const [raw, setRaw] = useState("");
  const [parsed, setParsed] = useState<ParsedCsv | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [result, setResult] = useState<ImportRunResult | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function applyParsed(p: ParsedCsv) {
    // autoMap 은 헤더 "이름"을 돌려주지만, 내부 매핑은 열 "인덱스"(문자열)로 보관한다.
    // 빈 헤더(값이 빈 문자열이면 Select 에러)·중복 헤더명 문제를 동시에 피하기 위함.
    const nameMap = cfg.autoMap(p.headers);
    const idxMap: Record<string, string> = {};
    for (const f of cfg.fields) {
      const name = nameMap[f.key];
      const idx = name && name !== NONE ? p.headers.indexOf(name) : -1;
      idxMap[f.key] = idx >= 0 ? String(idx) : NONE;
    }
    setParsed(p);
    setMapping(idxMap);
    setResult(null);
  }

  function handleParseText(text: string) {
    applyParsed(parseCsv(text));
  }

  async function handleFile(file: File) {
    setFileError(null);
    setResult(null);
    const name = file.name.toLowerCase();
    try {
      if (name.endsWith(".xlsx") || name.endsWith(".xls")) {
        // 엑셀은 클라이언트에서 동적 로드(번들 분리)
        const buf = await file.arrayBuffer();
        const XLSX = await import("xlsx");
        const wb = XLSX.read(buf, { type: "array" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        if (!ws) {
          setFileError("엑셀에서 시트를 찾지 못했습니다.");
          return;
        }
        const aoa = XLSX.utils.sheet_to_json(ws, {
          header: 1,
          raw: false,
          dateNF: "yyyy-mm-dd",
          defval: "",
        }) as unknown[][];
        const headers = (aoa[0] ?? []).map((h) => String(h ?? "").trim());
        const rows = aoa
          .slice(1)
          .map((r) => r.map((c) => String(c ?? "")))
          .filter((r) => r.some((x) => x.trim() !== ""));
        setRaw("");
        applyParsed({ headers, rows });
      } else {
        const text = await file.text();
        setRaw(text);
        handleParseText(text);
      }
    } catch {
      setFileError("파일을 읽지 못했습니다. 형식(.xlsx 또는 .csv)을 확인하세요.");
    }
  }

  function buildRows(): Record<string, string>[] {
    if (!parsed) return [];
    const colOf = (field: string) => {
      const v = mapping[field];
      return v && v !== NONE ? Number(v) : -1;
    };
    const fieldIdx = Object.fromEntries(
      cfg.fields.map((f) => [f.key, colOf(f.key)]),
    ) as Record<string, number>;

    return parsed.rows.map((r) => {
      const row: Record<string, string> = {};
      for (const f of cfg.fields) {
        const i = fieldIdx[f.key];
        if (i >= 0) row[f.key] = (r[i] ?? "").trim();
      }
      return row;
    });
  }

  function downloadTemplate() {
    const esc = (v: string) =>
      /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
    const csv =
      "﻿" +
      [cfg.template.headers, cfg.template.example]
        .map((r) => r.map(esc).join(","))
        .join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = cfg.template.filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  const requiredMapped =
    !!mapping[cfg.requiredKey] && mapping[cfg.requiredKey] !== NONE;
  const requiredLabel =
    cfg.fields.find((f) => f.key === cfg.requiredKey)?.label ?? cfg.requiredKey;
  const rows = parsed ? buildRows() : [];
  const importable = rows.filter(
    (r) => (r[cfg.requiredKey] ?? "").trim() !== "",
  ).length;

  function handleImport() {
    setResult(null);
    startTransition(async () => {
      setResult(await cfg.run(buildRows()));
    });
  }

  return (
    <div className="space-y-6">
      {/* 1. 입력 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">1. 파일 불러오기</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex w-fit cursor-pointer items-center gap-2 rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-xs hover:bg-muted/40">
              <FileUp className="size-4" />
              엑셀·CSV 파일 선택
              <input
                type="file"
                accept=".xlsx,.xls,.csv,text/csv"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFile(f);
                  e.target.value = "";
                }}
              />
            </label>
            <Button type="button" variant="ghost" onClick={downloadTemplate}>
              <Download />
              양식 다운로드
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            엑셀(.xlsx) 파일을 그대로 올리거나, 첫 줄을 헤더로 하는 표를 아래에
            붙여넣으세요. 컬럼 순서·이름은 달라도 다음 단계에서 매핑할 수 있습니다.
          </p>
          <Textarea
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
            rows={4}
            placeholder={cfg.placeholder}
            className="font-mono text-xs"
          />
          <Button
            type="button"
            variant="outline"
            disabled={!raw.trim()}
            onClick={() => handleParseText(raw)}
          >
            <Upload />
            붙여넣은 내용 파싱
          </Button>
          {fileError && (
            <p className="text-sm text-destructive" role="alert">
              {fileError}
            </p>
          )}
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
            {cfg.fields.map((f) => (
              <Field key={f.key} label={f.label} required={f.required}>
                <Select
                  value={mapping[f.key] ?? NONE}
                  onValueChange={(v) =>
                    setMapping((m) => ({ ...m, [f.key]: v }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="컬럼 선택" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>— 사용 안 함 —</SelectItem>
                    {parsed.headers.map((h, i) => (
                      <SelectItem key={`${h}-${i}`} value={String(i)}>
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
            <CardTitle className="text-base">
              3. 미리보기 &amp; 가져오기
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {!requiredMapped && (
              <p className="text-sm text-destructive">
                “{requiredLabel}”을(를) 컬럼에 매핑해야 가져올 수 있습니다.
              </p>
            )}

            {requiredMapped && (
              <div className="overflow-x-auto rounded-lg border border-border">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border bg-muted/40 text-left text-muted-foreground">
                      {cfg.previewColumns.map((c) => (
                        <th key={c.key} className="px-3 py-2 font-medium">
                          {c.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.slice(0, 5).map((r, i) => (
                      <tr
                        key={i}
                        className="border-b border-border last:border-0"
                      >
                        {cfg.previewColumns.map((c) => (
                          <td key={c.key} className="px-3 py-1.5">
                            {r[c.key]?.trim() || "—"}
                          </td>
                        ))}
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
                disabled={!requiredMapped || importable === 0 || pending}
                onClick={handleImport}
              >
                {pending
                  ? "가져오는 중…"
                  : `${importable}개 ${cfg.unit} 가져오기`}
              </Button>
              {importable === 0 && requiredMapped && (
                <span className="text-sm text-muted-foreground">
                  {requiredLabel}이(가) 채워진 행이 없습니다.
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
                {cfg.renderSummary(result)}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
