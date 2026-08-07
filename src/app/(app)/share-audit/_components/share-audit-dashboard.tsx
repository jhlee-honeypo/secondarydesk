"use client";

import { useMemo, useState } from "react";
import { FileText } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/format";
import type { FundSummary, QueueItem, ShareAuditRow, Verdict } from "../types";
import { QueueBoard } from "./queue-board";

// slab CDN 원본 PDF를 same-origin·inline 으로 여는 프록시(등기 화면과 동일 경로)
const pdfHref = (url: string) =>
  `/api/financial-file?url=${encodeURIComponent(url)}`;

const fmt = (n: number | null) => (n === null ? "—" : n.toLocaleString("ko-KR"));

const VERDICT_VARIANT: Record<
  Verdict,
  "default" | "secondary" | "destructive" | "outline"
> = {
  일치: "secondary",
  불일치: "destructive",
  "등기 없음": "outline",
  "slab 미기재": "outline",
};

export function ShareAuditDashboard({
  rows,
  summaries,
  queue,
  withRegistry,
  currentUserId,
}: {
  rows: ShareAuditRow[];
  summaries: FundSummary[];
  queue: QueueItem[];
  withRegistry: number;
  currentUserId: string | null;
}) {
  const [q, setQ] = useState("");
  // 조합 필터는 조치 큐·요약표·상세표가 함께 쓴다(조합을 고르면 화면 전체가 좁혀진다).
  const [fund, setFund] = useState("");
  const [verdict, setVerdict] = useState<Verdict | "">("");
  const [onlyReportDiff, setOnlyReportDiff] = useState(false);

  const totals = useMemo(
    () => ({
      total: rows.length,
      match: rows.filter((r) => r.verdict === "일치").length,
      mismatch: rows.filter((r) => r.verdict === "불일치").length,
      noRegistry: rows.filter((r) => r.verdict === "등기 없음").length,
      noSlab: rows.filter((r) => r.verdict === "slab 미기재").length,
      reportDiff: rows.filter((r) => r.reportDiff).length,
    }),
    [rows],
  );

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (fund && !r.fundIds.includes(fund)) return false;
      if (verdict && r.verdict !== verdict) return false;
      if (onlyReportDiff && !r.reportDiff) return false;
      if (!term) return true;
      return [r.companyName, r.companyNameEn]
        .filter(Boolean)
        .some((v) => v!.toLowerCase().includes(term));
    });
  }, [q, fund, verdict, onlyReportDiff, rows]);

  const shown = fund ? summaries.find((s) => s.id === fund) : null;
  const kpi = shown ?? totals;
  const scopedQueue = fund ? queue.filter((i) => i.fundIds.includes(fund)) : queue;
  const regRate =
    rows.length > 0 ? Math.round((withRegistry / rows.length) * 100) : 0;

  // 조치 큐 드롭다운 옵션. 조합마다 큐에 몇 건이 걸려 있는지 함께 보여 우선순위를
  // 드롭다운에서 바로 판단할 수 있게 한다(0건인 조합도 남겨 둔다 — 없음을 확인하려 고른다).
  const fundOptions = useMemo(() => {
    const queueCount = new Map<string, number>();
    for (const i of queue)
      for (const fid of i.fundIds)
        queueCount.set(fid, (queueCount.get(fid) ?? 0) + 1);
    return [
      { value: "", label: `전체 조합 · ${queue.length}건` },
      ...summaries.map((s) => {
        const n = queueCount.get(s.id) ?? 0;
        return { value: s.id, label: n > 0 ? `${s.label} · ${n}건` : s.label };
      }),
    ];
  }, [queue, summaries]);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Metric label="조합" value={`${summaries.length}개`} />
        <Metric
          label={fund ? "이 조합 포트폴리오사" : "포트폴리오사"}
          value={`${kpi.total}곳`}
        />
        <Metric
          label="조치 필요(불일치)"
          value={`${kpi.mismatch}곳`}
          tone="danger"
        />
        <Metric
          label="확인 필요"
          value={`${scopedQueue.filter((i) => i.severity === "yellow").length}곳`}
          tone="warn"
        />
        <Metric
          label="등기 확보율"
          value={`${regRate}%`}
          sub={`${withRegistry} / ${rows.length}곳`}
          tone="muted"
        />
      </div>

      {/* 조치 큐 — 사람이 확인해야 하는 건만. 확인/무시·메모를 여기서 남긴다. */}
      <QueueBoard
        items={scopedQueue}
        fund={fund}
        onFundChange={setFund}
        fundOptions={fundOptions}
        currentUserId={currentUserId}
      />

      {/* 조합별 요약 — 행을 누르면 화면 전체가 그 조합으로 좁혀진다. */}
      <div className="space-y-2">
        <h2 className="text-sm font-semibold">조합별 현황</h2>
        <Card className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2">조합</th>
                <th className="px-3 py-2 text-right">대상</th>
                <th className="px-3 py-2 text-right">일치</th>
                <th className="px-3 py-2 text-right">불일치</th>
                <th className="px-3 py-2 text-right">등기 없음</th>
                <th className="px-3 py-2 text-right">slab 미기재</th>
                <th className="px-3 py-2 text-right">분기보고 상이</th>
              </tr>
            </thead>
            <tbody>
              <tr
                onClick={() => setFund("")}
                className={`cursor-pointer border-b text-muted-foreground hover:bg-muted/40 ${
                  fund === "" ? "bg-muted/60" : ""
                }`}
              >
                <td className="px-3 py-2 font-medium">전체 조합</td>
                <td className="px-3 py-2 text-right tabular-nums">{totals.total}</td>
                <td className="px-3 py-2 text-right tabular-nums">{totals.match}</td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {totals.mismatch}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {totals.noRegistry}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{totals.noSlab}</td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {totals.reportDiff}
                </td>
              </tr>
              {summaries.map((s) => (
                <tr
                  key={s.id}
                  onClick={() => setFund(s.id)}
                  className={`cursor-pointer border-b last:border-0 hover:bg-muted/40 ${
                    fund === s.id ? "bg-muted/60" : ""
                  }`}
                >
                  <td className="px-3 py-2">{s.label}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{s.total}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{s.match}</td>
                  <td
                    className={`px-3 py-2 text-right tabular-nums ${
                      s.mismatch > 0 ? "font-semibold text-destructive" : ""
                    }`}
                  >
                    {s.mismatch}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                    {s.noRegistry}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                    {s.noSlab}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {s.reportDiff}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>

      {/* 전수 표 — 큐에 안 오는 '일치·등기 없음'까지 포함한 원장 */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="mr-1 text-sm font-semibold">전체 목록</h2>
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="회사명으로 검색"
            className="max-w-xs"
          />
          <div className="flex gap-1">
            {(["", "불일치", "일치", "등기 없음", "slab 미기재"] as const).map(
              (v) => (
                <button
                  key={v || "all"}
                  type="button"
                  onClick={() => setVerdict(v)}
                  className={`rounded-md border px-2.5 py-1 text-xs transition-colors ${
                    verdict === v
                      ? "border-primary bg-primary/10 font-medium text-primary"
                      : "text-muted-foreground hover:bg-muted"
                  }`}
                >
                  {v || "전체"}
                </button>
              ),
            )}
          </div>
          <label className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <input
              type="checkbox"
              checked={onlyReportDiff}
              onChange={(e) => setOnlyReportDiff(e.target.checked)}
              className="size-3.5"
            />
            분기보고 상이만
          </label>
          <span className="text-sm text-muted-foreground">
            {filtered.length}
            {filtered.length !== rows.length && ` / ${rows.length}`}곳
          </span>
        </div>

        <Card className="overflow-x-auto p-0">
          <table className="w-full table-fixed text-sm">
            <colgroup>
              <col className="w-[20%]" />
              <col className="w-[7%]" />
              <col className="w-[12%]" />
              <col className="w-[15%]" />
              <col className="w-[19%]" />
              <col className="w-[11%]" />
              <col className="w-[10%]" />
              <col className="w-[6%]" />
            </colgroup>
            <thead className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2">회사</th>
                <th className="px-3 py-2">상태</th>
                <th className="px-3 py-2 text-right">slab</th>
                <th className="px-3 py-2 text-right">분기보고</th>
                <th className="px-3 py-2 text-right">등기</th>
                <th className="px-3 py-2 text-right">차이(slab−등기)</th>
                <th className="px-3 py-2">판정</th>
                <th className="px-3 py-2">원본</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.companyId} className="border-b align-top last:border-0">
                  <td className="px-3 py-2 font-medium">
                    {r.companyName}
                    {r.companyNameEn && (
                      <span className="block text-xs text-muted-foreground">
                        {r.companyNameEn}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <Badge variant="outline" className="text-[10px]">
                      {r.status}
                    </Badge>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">
                    {fmt(r.slabShares)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">
                    <span
                      className={
                        r.reportDiff ? "text-amber-600 dark:text-amber-500" : ""
                      }
                    >
                      {fmt(r.reportShares)}
                    </span>
                    {r.reportPeriod && (
                      <span className="block text-[10px] text-muted-foreground">
                        {r.reportPeriod}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">
                    {fmt(r.registryShares)}
                    {r.registryShares != null && (
                      // 기준일 = 그 주식수가 등기된 마지막 변경등기일, 발행일 = 등기부를
                      // 발급받은 날(= 우리가 확인한 시점). 최신성은 발행일로 판단한다.
                      <span className="block text-[10px] text-muted-foreground">
                        기준 {formatDate(r.registrySharesAsOf) || "—"} · 발행{" "}
                        {formatDate(r.registryIssueDate) || "—"}
                      </span>
                    )}
                  </td>
                  <td
                    className={`px-3 py-2 text-right tabular-nums whitespace-nowrap ${
                      r.delta
                        ? "font-medium text-destructive"
                        : "text-muted-foreground"
                    }`}
                  >
                    {r.delta === null
                      ? "—"
                      : r.delta === 0
                        ? "0"
                        : `${r.delta > 0 ? "+" : ""}${r.delta.toLocaleString("ko-KR")}`}
                  </td>
                  <td className="px-3 py-2">
                    <Badge
                      variant={VERDICT_VARIANT[r.verdict]}
                      className="text-[10px]"
                    >
                      {r.verdict}
                    </Badge>
                  </td>
                  <td className="px-3 py-2">
                    {r.registrySourceUrl ? (
                      <a
                        href={pdfHref(r.registrySourceUrl)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 whitespace-nowrap text-primary underline"
                        title={r.registrySourceFile ?? "등기부등본 원본"}
                      >
                        <FileText className="size-3.5" />
                        등본
                      </a>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>

        <p className="text-xs text-muted-foreground">
          판정은 slab 값과 등기값의 대조입니다. <b>불일치가 곧 slab 오류는 아닙니다</b> —
          slab 값이 더 크고 등기 발행일 이후 신주 발행이 있었다면 등기가 그 시점을 못 담은
          것이므로 조치는 “등기 재발급 확인”입니다. 등기 발행일이 최근인데도 어긋나면 그때
          slab 갱신 누락을 의심하세요. 분기보고 값은 회사 자가입력이라 자릿수 오기가 섞이니
          대표값으로 쓰지 마세요.
        </p>
      </div>
    </div>
  );
}

function Metric({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "danger" | "warn" | "muted";
}) {
  const color =
    tone === "danger"
      ? "text-destructive"
      : tone === "warn"
        ? "text-amber-600 dark:text-amber-500"
        : tone === "muted"
          ? "text-muted-foreground"
          : "";
  return (
    <Card size="sm">
      <CardContent className="space-y-1">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className={`text-2xl font-semibold tracking-tight ${color}`}>{value}</p>
        {sub && <p className="text-[11px] text-muted-foreground">{sub}</p>}
      </CardContent>
    </Card>
  );
}
