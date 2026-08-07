import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { CorporateRegistration } from "@/lib/types";
import { getShareAuditCompanies } from "@/lib/bubble";
import { fundLabel } from "@/lib/format";
import type {
  FundSummary,
  QueueItem,
  ReviewStatus,
  ShareAuditData,
  ShareAuditRow,
} from "./types";

// 발행주식수 점검의 데이터 조립. 화면(page.tsx)과 내보내기(export/route.ts)가
// 같은 판정을 써야 하므로 한곳에 둔다 — 양쪽에 복사하면 조용히 어긋난다.
//
// 세 출처:
//   ① slab 회사정보 'share outstanding'(계산값) — 우리가 관리하는 값
//   ② 회사가 분기보고에 직접 적은 값 — 자가입력이라 자릿수 오기가 섞인다
//   ③ 법인등기부등본 추출값 — 이미 쌓아 둔 corporate_registrations(신규 OCR 없음)

const fmt = (n: number | null) => (n === null ? "—" : n.toLocaleString("ko-KR"));

export async function loadShareAudit(): Promise<ShareAuditData> {
  const supabase = await createClient();

  const [
    { data: regData },
    { data: fundRows },
    { data: reviewRows },
    { data: memoRows },
    audit,
  ] = await Promise.all([
    supabase.from("corporate_registrations").select("*"),
    supabase.from("holding_funds").select("id, name, short_name, bubble_id"),
    // 마이그레이션 미적용 환경에서도 화면이 죽지 않게 — 없으면 전부 'open' 으로 동작.
    supabase.from("share_audit_reviews").select("company_id, status"),
    supabase.from("share_audit_memos").select("company_id"),
    getShareAuditCompanies().catch(() => ({
      companies: [],
      excludedTestRecords: 0,
    })),
  ]);

  const regByCompany = new Map<string, CorporateRegistration>();
  for (const r of (regData ?? []) as CorporateRegistration[]) {
    if (r.bubble_company_id) regByCompany.set(r.bubble_company_id, r);
  }

  const statusByCompany = new Map<string, ReviewStatus>();
  for (const r of reviewRows ?? [])
    statusByCompany.set(r.company_id as string, r.status as ReviewStatus);

  const memoCountByCompany = new Map<string, number>();
  for (const m of memoRows ?? []) {
    const cid = m.company_id as string;
    memoCountByCompany.set(cid, (memoCountByCompany.get(cid) ?? 0) + 1);
  }

  // slab fund _id → 운용펀드 {id, label}. 등기 화면과 같은 매핑을 쓴다.
  const fundBySlabId = new Map<string, { id: string; label: string }>();
  for (const f of fundRows ?? []) {
    if (f.bubble_id)
      fundBySlabId.set(f.bubble_id as string, {
        id: f.id as string,
        label: fundLabel(f as { name: string; short_name: string | null }),
      });
  }

  const rows: ShareAuditRow[] = audit.companies.map((c) => {
    const reg = regByCompany.get(c.companyId) ?? null;
    const registryShares = reg?.total_issued_shares ?? null;

    // 판정은 '우리 값(slab) vs 등기'다. 둘 중 하나가 없으면 대조 자체가 불가하므로
    // 불일치로 몰지 않고 없는 쪽을 밝힌다(입력 누락과 값 불일치는 조치가 다르다).
    const verdict: ShareAuditRow["verdict"] =
      registryShares == null
        ? "등기 없음"
        : c.slabShares == null
          ? "slab 미기재"
          : c.slabShares === registryShares
            ? "일치"
            : "불일치";

    // 분기보고 자가입력값이 기준값과 다른지. 등기가 있으면 등기와, 없으면 slab 과 비교.
    const reportBase = registryShares ?? c.slabShares;
    const reportDiff =
      c.reportShares != null &&
      reportBase != null &&
      c.reportShares !== reportBase;

    const funds = c.fundIds
      .map((sid) => fundBySlabId.get(sid))
      .filter((v): v is { id: string; label: string } => Boolean(v));

    return {
      companyId: c.companyId,
      companyName: c.nameKr,
      companyNameEn: c.nameEn,
      status: c.status,
      fundIds: funds.map((f) => f.id),
      fundLabels: funds.map((f) => f.label),
      slabShares: c.slabShares,
      reportShares: c.reportShares,
      reportPeriod: c.reportPeriod,
      registryShares,
      registrySharesAsOf: reg?.shares_as_of_date ?? null,
      registryIssueDate: reg?.issue_date ?? null,
      registrySourceUrl: reg?.source_file_url ?? null,
      registrySourceFile: reg?.source_file ?? null,
      verdict,
      // slab − 등기. 부호가 방향을 알려준다(양수 = slab 이 더 많음).
      delta:
        registryShares != null && c.slabShares != null
          ? c.slabShares - registryShares
          : null,
      reportDiff,
    };
  });

  // 조치 큐 — 사람이 손대야 하는 것만. '등기 없음' 은 큐에 넣지 않는다(200곳이 넘어
  // 큐가 무의미해지고, 조치가 '등기 확보' 라 성격이 다르다 → KPI 로만 본다).
  //   🔴 조치  = 불일치(slab 과 등기가 어긋남)
  //   🟡 확인  = slab 미기재 · 분기보고 값만 어긋남
  const absDelta = (r: { slabShares: number | null; registryShares: number | null }) =>
    r.registryShares != null && r.slabShares != null
      ? Math.abs(r.slabShares - r.registryShares)
      : 0;

  const queue: QueueItem[] = rows
    .filter(
      (r) => r.verdict === "불일치" || r.verdict === "slab 미기재" || r.reportDiff,
    )
    .map((r) => {
      const detail =
        r.verdict === "불일치"
          ? `등기 ${fmt(r.registryShares)} · slab ${fmt(r.slabShares)}` +
            (r.delta !== null
              ? ` (차 ${r.delta > 0 ? "+" : ""}${r.delta.toLocaleString("ko-KR")})`
              : "")
          : r.verdict === "slab 미기재"
            ? `slab 발행주식총수 미기재 · 등기 ${fmt(r.registryShares)}`
            : `분기보고 ${fmt(r.reportShares)} 상이 · 기준 ${fmt(
                r.registryShares ?? r.slabShares,
              )}`;
      // 세 값이 모두 다른 건은 가장 확인이 급하다 — detail 에 명시한다.
      const threeWay =
        r.slabShares != null &&
        r.registryShares != null &&
        r.reportShares != null &&
        new Set([r.slabShares, r.registryShares, r.reportShares]).size === 3;

      return {
        companyId: r.companyId,
        companyName: r.companyName,
        fundIds: r.fundIds,
        fundLabels: r.fundLabels,
        severity: r.verdict === "불일치" ? ("red" as const) : ("yellow" as const),
        kind:
          r.verdict === "불일치"
            ? ("발행주식수 불일치" as const)
            : ("확인 필요" as const),
        detail: threeWay ? `${detail} · 세 출처 모두 상이` : detail,
        slabShares: r.slabShares,
        reportShares: r.reportShares,
        reportPeriod: r.reportPeriod,
        registryShares: r.registryShares,
        registrySharesAsOf: r.registrySharesAsOf,
        registryIssueDate: r.registryIssueDate,
        registrySourceUrl: r.registrySourceUrl,
        reviewStatus: statusByCompany.get(r.companyId) ?? "open",
        memoCount: memoCountByCompany.get(r.companyId) ?? 0,
      };
    })
    // 조치 먼저, 그다음 차이 큰 순(같으면 이름순)
    .sort(
      (a, b) =>
        (a.severity === "red" ? 0 : 1) - (b.severity === "red" ? 0 : 1) ||
        absDelta(b) - absDelta(a) ||
        a.companyName.localeCompare(b.companyName, "ko"),
    );

  // 조합별 요약 — 어느 조합을 먼저 훑어야 하는지 판단하는 입구다.
  const summaries: FundSummary[] = [...fundBySlabId.values()]
    .map((f) => {
      const own = rows.filter((r) => r.fundIds.includes(f.id));
      return {
        id: f.id,
        label: f.label,
        total: own.length,
        match: own.filter((r) => r.verdict === "일치").length,
        mismatch: own.filter((r) => r.verdict === "불일치").length,
        noRegistry: own.filter((r) => r.verdict === "등기 없음").length,
        noSlab: own.filter((r) => r.verdict === "slab 미기재").length,
        reportDiff: own.filter((r) => r.reportDiff).length,
      };
    })
    .filter((s) => s.total > 0)
    // 불일치 많은 조합을 위로(조치 우선순위), 같으면 이름순
    .sort((a, b) => b.mismatch - a.mismatch || a.label.localeCompare(b.label, "ko"));

  return {
    rows,
    summaries,
    queue,
    withRegistry: rows.filter((r) => r.registryShares != null).length,
    excludedTestRecords: audit.excludedTestRecords,
  };
}
