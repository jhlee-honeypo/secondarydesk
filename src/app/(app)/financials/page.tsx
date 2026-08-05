import { ExternalLink } from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/supabase/auth";
import {
  getSlabCompanyContacts,
  getSlabFinancialReports,
  type SlabFinancialReport,
} from "@/lib/bubble";
import { slabQuarterlyUrl } from "@/lib/slab-links";
import {
  LISTING_STATUS_LABEL,
  LISTING_STATUS_VARIANT,
  type FinancialStatement,
  type ListingStatus,
  type PositionStatus,
} from "@/lib/types";
import { fundLabel, formatWon, formatDate } from "@/lib/format";
import { computeMetrics, gradeHealth } from "@/lib/financial-health";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { FinancialsClient } from "./_components/financials-client";
import { FinancialsFilters } from "./_components/financials-filters";
import { BoardFileViewer } from "./_components/board-file-viewer";
import {
  CompanyContactHover,
  type CompanyContact,
} from "./_components/company-contact";
import { ListingMemos } from "./_components/listing-memos";
import {
  FinancialsView,
  type FinancialsSummary,
} from "./_components/financials-view";
import { HealthBadge } from "./_components/health-badge";
import { MeetingPin } from "./_components/meeting-pin";
import { FinancialHistory } from "./_components/financial-history";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // Claude 추출 배치(서버 액션)용 여유 타임아웃

function pct(v: number | null): string {
  return v === null ? "—" : `${(v * 100).toFixed(0)}%`;
}
function months(v: number | null): string {
  return v === null ? "흑자/충분" : `${v.toFixed(1)}개월`;
}
// slab 투자유치여부 영문 원문 → 한글
const FUNDING_LABEL: Record<string, string> = {
  None: "없음",
  Done: "완료",
  Expected: "예정",
  Ongoing: "진행중",
};
function fundingLabel(v: string): string {
  return FUNDING_LABEL[v] ?? v;
}

const RED = "bg-rose-100 font-medium text-rose-700 dark:bg-rose-950/40 dark:text-rose-300";
const YELLOW =
  "bg-amber-100 font-medium text-amber-700 dark:bg-amber-950/40 dark:text-amber-300";

// 런웨이 3개월 미만 → 빨강
function runwayClass(v: number | null): string {
  return v !== null && v < 3 ? RED : "";
}
// 월평균 차액(매출−지출) — 음수면 매달 현금이 줄어드는 중
function surplusClass(v: number | null): string {
  if (v === null) return "";
  return v < 0 ? "text-rose-600" : "text-emerald-600";
}
// 자본잠식률 0~50% → 노랑, 50% 초과 → 빨강 (잠식 없음/음수는 강조 안 함)
function erosionClass(v: number | null): string {
  if (v === null || v <= 0) return "";
  return v > 0.5 ? RED : YELLOW;
}
// EXIT·상각(W/O) — 실 작업 대상이 아닌 상태(가리기 토글 대상)
function isExited(status: ListingStatus | PositionStatus): boolean {
  return status === "EXIT" || status === "W/O";
}
// 회사명 매칭용 정규화(법인격·공백·구두점 제거)
function normName(s: string): string {
  return s
    .toLowerCase()
    .replace(/㈜|\(주\)|주식회사/g, "")
    .replace(/[\s.,·]/g, "");
}

type ListingRow = {
  id: string;
  company_name: string;
  company_name_en: string | null;
  bubble_id: string | null;
  status: ListingStatus;
};

// slab 분기보고 제출 현황(우리 DB 가 아니라 slab quarterlyupdate 가 원천).
type Submission = {
  reportMade: boolean;
  shareholderList: boolean;
  financialReport: boolean;
  register: boolean;
};
const NO_SUBMISSION: Submission = {
  reportMade: false,
  shareholderList: false,
  financialReport: false,
  register: false,
};

/** 좁은 열의 긴 머리글 — 단어 중간에서 깨지지 않게 지정한 자리에서만 두 줄로 끊는다. */
function TwoLine({ top, bottom }: { top: string; bottom: string }) {
  return (
    <>
      <span className="block">{top}</span>
      <span className="block">{bottom}</span>
    </>
  );
}

function OX({ on }: { on: boolean }) {
  return (
    <span className={on ? "font-semibold text-emerald-600" : "font-semibold text-rose-500"}>
      {on ? "O" : "X"}
    </span>
  );
}

function SubmissionCells({
  sub,
  slabUrl,
}: {
  sub: Submission;
  /** slab 분기보고 원본 화면(ERP 미연결 매물은 null → 링크 없이 배지만) */
  slabUrl: string | null;
}) {
  const label = sub.reportMade ? "제출" : "미제출";
  const tone = sub.reportMade ? "text-emerald-600" : "text-rose-500";
  return (
    <>
      <td className="px-3 py-2 text-center">
        {slabUrl ? (
          <Badge asChild variant="outline" className={cn("text-[10px]", tone)}>
            <a
              href={slabUrl}
              target="_blank"
              rel="noreferrer"
              title="slab 분기보고 원본 화면 열기(새 탭)"
            >
              {label}
              <ExternalLink />
            </a>
          </Badge>
        ) : (
          <Badge variant="outline" className={cn("text-[10px]", tone)}>
            {label}
          </Badge>
        )}
      </td>
      {/* O/X 세 열은 내용이 한 글자라 머리글 폭에 맞춰 px-2 로 좁힌다(머리글과 동일). */}
      <td className="px-2 py-2 text-center">
        <OX on={sub.shareholderList} />
      </td>
      <td className="px-2 py-2 text-center">
        <OX on={sub.financialReport} />
      </td>
      <td className="px-2 py-2 text-center">
        <OX on={sub.register} />
      </td>
    </>
  );
}

export default async function FinancialsPage({
  searchParams,
}: {
  searchParams: Promise<{ fund?: string; period?: string }>;
}) {
  const { fund = "", period = "" } = await searchParams;
  const supabase = await createClient();

  const [{ data: fundRows }, { data: periodRows }] = await Promise.all([
    supabase.from("holding_funds").select("id, name, short_name").order("name"),
    // 분기 옵션은 저장된 재무 데이터의 연도·보고월에서 도출
    supabase
      .from("financial_statements")
      .select("report_year, report_month")
      .order("report_year", { ascending: false })
      .order("report_month", { ascending: false }),
  ]);

  const fundOptions = [
    { value: "", label: "전체 (선택 안 함)" },
    ...(fundRows ?? []).map((f) => ({
      value: f.id as string,
      label: fundLabel(f as { name: string; short_name: string | null }),
    })),
  ];

  const periodSeen = new Set<string>();
  const periodOptions = [
    { value: "", label: "최신 분기" },
    ...(periodRows ?? [])
      .map((p) => `${p.report_year}-${p.report_month}`)
      .filter((k) => (periodSeen.has(k) ? false : (periodSeen.add(k), true)))
      .map((k) => {
        const [y, m] = k.split("-").map(Number);
        return { value: k, label: `${y}년 ${m / 3}분기` };
      }),
  ];

  const [selY, selM] = period ? period.split("-").map(Number) : [0, 0];

  // 선택한 조합의 매물 목록 + 각 매물에 매칭되는 재무 데이터(분기 지정 시 그 분기, 아니면 최신)
  let roster: {
    listing: ListingRow;
    fin: FinancialStatement | null;
    sub: Submission;
    // 이 분기의 slab 분기보고 원본. 재무제표가 없어도 기업이 직접 기입한 정성
    // 정보(투자유치·직원·하이라이트)는 여기 있어, fin 이 없는 행에서 대신 보여준다.
    slab: SlabFinancialReport | null;
    contact: CompanyContact | null;
    memoCount: number;
    // 이 조합의 취급상태(ERP 투자내역 없으면 null → 회사 상태로 폴백)
    position: PositionStatus | null;
    // 미팅 대상 핀(메모의 리마인드 기록과 별개인 on/off 상태)
    meeting: boolean;
  }[] = [];
  // 제출 현황을 볼 분기 — 선택한 분기, 미선택이면 slab 의 최신 분기
  let subY = selY;
  let subM = selM;

  if (fund) {
    const { data: lf } = await supabase
      .from("listing_funds")
      .select("listing_id, position_status")
      .eq("holding_fund_id", fund);
    const listingIds = (lf ?? []).map((r) => r.listing_id as string);
    const positionByListing = new Map<string, PositionStatus | null>(
      (lf ?? []).map((r) => [
        r.listing_id as string,
        r.position_status as PositionStatus | null,
      ]),
    );

    if (listingIds.length > 0) {
      const [
        { data: listingRows },
        { data: finRows },
        { data: memoRows },
        { data: meetingRows },
        slabReports,
        slabContacts,
      ] = await Promise.all([
        supabase
          .from("listings")
          .select("id, company_name, company_name_en, bubble_id, status")
          .in("id", listingIds)
          .order("company_name"),
        supabase
          .from("financial_statements")
          .select("*")
          .order("report_year", { ascending: false })
          .order("report_month", { ascending: false }),
        supabase.from("listing_memos").select("listing_id").in("listing_id", listingIds),
        supabase
          .from("listing_meeting_targets")
          .select("listing_id")
          .in("listing_id", listingIds),
        // slab 이 죽어도 재무 표는 떠야 하므로 실패 시 빈 배열(제출 현황만 전부 미제출로 표시)
        getSlabFinancialReports().catch(() => []),
        getSlabCompanyContacts().catch(() => []),
      ]);

      const memoCountByListing = new Map<string, number>();
      for (const m of memoRows ?? []) {
        const k = m.listing_id as string;
        memoCountByListing.set(k, (memoCountByListing.get(k) ?? 0) + 1);
      }
      const meetingListings = new Set(
        (meetingRows ?? []).map((r) => r.listing_id as string),
      );
      const contactByBubble = new Map<string, CompanyContact>();
      const contactByName = new Map<string, CompanyContact>();
      for (const c of slabContacts) {
        contactByBubble.set(c.companyId, c);
        const n = normName(c.nameKr);
        if (n && !contactByName.has(n)) contactByName.set(n, c);
      }

      if (!period) {
        for (const r of slabReports) {
          if (r.year * 100 + r.month > subY * 100 + subM) {
            subY = r.year;
            subM = r.month;
          }
        }
      }
      const repByBubble = new Map<string, SlabFinancialReport>();
      const repByName = new Map<string, SlabFinancialReport>();
      for (const r of slabReports) {
        if (r.year !== subY || r.month !== subM) continue;
        repByBubble.set(r.companyId, r);
        const n = normName(r.nameKr);
        if (!repByName.has(n)) repByName.set(n, r);
      }

      const byBubble = new Map<string, FinancialStatement>();
      const byName = new Map<string, FinancialStatement>();
      for (const f of (finRows ?? []) as FinancialStatement[]) {
        // 분기 지정 시 그 분기만, 미지정 시 desc 정렬상 첫 건(=최신)
        if (period && (f.report_year !== selY || f.report_month !== selM)) continue;
        if (f.bubble_company_id && !byBubble.has(f.bubble_company_id))
          byBubble.set(f.bubble_company_id, f);
        const n = normName(f.company_name);
        if (!byName.has(n)) byName.set(n, f);
      }

      roster = ((listingRows ?? []) as ListingRow[])
        .map((l) => {
          const rep =
            (l.bubble_id ? repByBubble.get(l.bubble_id) : undefined) ??
            repByName.get(normName(l.company_name)) ??
            null;
          return {
            listing: l,
            fin:
              (l.bubble_id ? byBubble.get(l.bubble_id) : undefined) ??
              byName.get(normName(l.company_name)) ??
              null,
            sub: rep
              ? {
                  reportMade: rep.reportMade,
                  shareholderList: rep.hasShareholderList,
                  financialReport: rep.hasFile,
                  register: rep.hasRegister,
                }
              : NO_SUBMISSION,
            slab: rep,
            contact:
              (l.bubble_id ? contactByBubble.get(l.bubble_id) : undefined) ??
              contactByName.get(normName(l.company_name)) ??
              null,
            memoCount: memoCountByListing.get(l.id) ?? 0,
            position: positionByListing.get(l.id) ?? null,
            meeting: meetingListings.has(l.id),
          };
        })
        // 분기보고 제출 기업이 상단, 미제출은 하단. 같은 그룹 안에서는 회사명순.
        .sort(
          (a, b) =>
            Number(b.sub.reportMade) - Number(a.sub.reportMade) ||
            a.listing.company_name.localeCompare(b.listing.company_name, "ko"),
        );
    }
  }

  // 요약 카운트 — "W/O·EXIT 가리기" 토글에 맞춰 두 벌을 넘긴다(클라에서 골라 표시).
  const summarize = (rows: typeof roster): FinancialsSummary => {
    const graded = rows
      .filter((r) => r.fin)
      .map((r) => gradeHealth(r.fin!, computeMetrics(r.fin!)).level);
    return {
      submitted: rows.filter((r) => r.sub.reportMade).length,
      unsubmitted: rows.filter((r) => !r.sub.reportMade).length,
      danger: graded.filter((g) => g === "danger").length,
      warning: graded.filter((g) => g === "warning").length,
      good: graded.filter((g) => g === "good").length,
      none: rows.length - graded.length,
    };
  };
  const summary = {
    all: summarize(roster),
    live: summarize(roster.filter((r) => !isExited(r.position ?? r.listing.status))),
  };
  const subLabel = subY > 0 ? `${subY}년 ${subM / 3}분기` : "";
  const me = await getCurrentUser();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">재무 점검</h1>
          <p className="text-sm text-muted-foreground">
            조합을 선택하면 소속 매물의 분기보고 제출 현황과 재무상태를 점검합니다.
          </p>
        </div>
        <FinancialsClient />
      </div>

      <FinancialsView
        filters={
          <FinancialsFilters
            funds={fundOptions}
            periods={periodOptions}
            fund={fund}
            period={period}
          />
        }
        summary={fund ? summary : null}
      >
        {!fund ? (
          <Card className="p-10 text-center text-sm text-muted-foreground">
            상단에서 <b>조합</b>을 선택하면 소속 매물 목록과 재무상태가 표시됩니다.
          </Card>
        ) : roster.length === 0 ? (
          <Card className="p-10 text-center text-sm text-muted-foreground">
            이 조합에 연결된 매물이 없습니다.
          </Card>
        ) : (
          <Card className="overflow-x-auto p-0">
            <table className="w-full text-sm">
              {/* whitespace-nowrap 은 상속되므로 thead 에 한 번 걸어 모든 머리글의
                  단어 중간 줄바꿈을 막는다. 좁은 열의 긴 이름만 TwoLine 으로
                  의미 단위에서 두 줄로 끊는다(최대 2줄). */}
              <thead className="border-b bg-muted/40 text-left text-xs whitespace-nowrap text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">상태</th>
                  <th className="px-3 py-2">회사</th>
                  <th className="px-3 py-2 text-center">
                    분기보고
                    {subLabel && (
                      <span className="block text-[10px] font-normal">{subLabel}</span>
                    )}
                  </th>
                  <th className="px-2 py-2 text-center">
                    <TwoLine top="주주" bottom="명부" />
                  </th>
                  <th className="px-2 py-2 text-center">
                    <TwoLine top="재무" bottom="제표" />
                  </th>
                  <th className="px-2 py-2 text-center">
                    <TwoLine top="등기부" bottom="등본" />
                  </th>
                  <th className="px-3 py-2">기준</th>
                  <th className="px-3 py-2 text-right">보유현금</th>
                  <th className="px-3 py-2 text-right">월평균매출</th>
                  <th
                    className="px-3 py-2 text-right"
                    title="판관비 ÷ 보고월 — 런웨이 계산과 같은 기준(매출원가 제외)"
                  >
                    월평균지출
                  </th>
                  <th
                    className="px-3 py-2 text-right"
                    title="월평균매출 − 월평균지출 (음수면 매달 현금 소모)"
                  >
                    월평균차액
                  </th>
                  <th className="px-3 py-2 text-right">런웨이</th>
                  <th className="px-3 py-2 text-right">
                    <TwoLine top="자본" bottom="잠식률" />
                  </th>
                  <th className="px-3 py-2 text-right">
                    <TwoLine top="매출" bottom="성장" />
                  </th>
                  <th className="px-3 py-2">손익</th>
                  <th className="px-3 py-2">투자유치</th>
                  <th className="px-3 py-2 text-right">직원</th>
                  <th className="px-3 py-2">하이라이트</th>
                  <th
                    className="px-3 py-2 text-center"
                    title="실무 코멘트 스레드(예: 분기보고 리마인드 메일 발송 기록)"
                  >
                    메모
                  </th>
                  <th
                    className="px-2 py-2 text-center"
                    title="재무를 보고 미팅이 필요하다고 판단한 기업에 핀 — 메모와 별개의 표시입니다"
                  >
                    미팅
                  </th>
                </tr>
              </thead>
              <tbody>
                {roster.map(
                  ({
                    listing,
                    fin,
                    sub,
                    slab,
                    contact,
                    memoCount,
                    position,
                    meeting,
                  }) => {
                  // 상단 요약 토글이 CSS 로 걸러 쓰는 표식(financials-view.tsx / globals.css)
                  const rowFlags = {
                    "data-sub": sub.reportMade ? "yes" : "no",
                    "data-exited": isExited(position ?? listing.status) ? "1" : "0",
                  };
                  // 분기보고 열이 가리키는 분기(subY/subM)의 slab 원본 화면
                  const slabUrl = slabQuarterlyUrl(listing.bubble_id, subY, subM);
                  const memoCell = (
                    <td className="px-3 py-2 text-center">
                      <ListingMemos
                        listingId={listing.id}
                        companyName={listing.company_name}
                        count={memoCount}
                        currentUserId={me?.id ?? null}
                      />
                    </td>
                  );
                  const meetingCell = (
                    <td className="px-2 py-2 text-center">
                      <MeetingPin
                        listingId={listing.id}
                        companyName={listing.company_name}
                        initial={meeting}
                      />
                    </td>
                  );
                  const companyCell = (
                    <div className="flex items-start gap-1.5">
                      <div className="min-w-0">
                        {/* 클릭 = 분기별 재무 추이(오버레이), hover = slab 연락처 */}
                        <FinancialHistory
                          companyName={listing.company_name}
                          companyNameEn={listing.company_name_en}
                          bubbleCompanyId={listing.bubble_id}
                          financialCompanyName={
                            fin?.company_name ?? listing.company_name
                          }
                        >
                          <CompanyContactHover
                            companyName={listing.company_name}
                            companyNameEn={listing.company_name_en}
                            contact={contact}
                          />
                        </FinancialHistory>
                      </div>
                      {/* 이 조합의 취급상태. ERP 투자내역이 없는 링크(수기 태그)는
                          회사 전체 상태로 폴백하고 tooltip 으로 출처를 밝힌다. */}
                      <Badge
                        variant={LISTING_STATUS_VARIANT[position ?? listing.status]}
                        className="shrink-0 text-[10px]"
                        title={
                          position
                            ? "이 조합의 취급상태 (ERP 투자내역 기준)"
                            : "이 조합의 ERP 투자내역이 없어 회사 전체 상태를 표시합니다"
                        }
                      >
                        {LISTING_STATUS_LABEL[position ?? listing.status]}
                        {!position && "*"}
                      </Badge>
                    </div>
                  );
                  if (!fin) {
                    // 데이터 미수집/미제출 — 회색 빈 행
                    return (
                      <tr
                        key={listing.id}
                        {...rowFlags}
                        className="border-b align-top text-muted-foreground/60 last:border-0"
                      >
                        <td className="px-3 py-2">
                          <Badge
                            variant="outline"
                            className="cursor-help text-[10px]"
                            title="재무제표 미수집 — 판정 근거 없음"
                          >
                            데이터 없음
                          </Badge>
                        </td>
                        <td className="px-3 py-2 font-medium">{companyCell}</td>
                        <SubmissionCells sub={sub} slabUrl={slabUrl} />
                        <td className="px-3 py-2">—</td>
                        <td className="px-3 py-2 text-right">—</td>
                        <td className="px-3 py-2 text-right">—</td>
                        <td className="px-3 py-2 text-right">—</td>
                        <td className="px-3 py-2 text-right">—</td>
                        <td className="px-3 py-2 text-right">—</td>
                        <td className="px-3 py-2 text-right">—</td>
                        <td className="px-3 py-2 text-right">—</td>
                        <td className="px-3 py-2">—</td>
                        {/* 아래 세 열은 재무제표가 없어도 채워진다 — 기업이 slab
                            분기보고에 직접 기입한 값이라 추출이 필요 없다. */}
                        <td className="px-3 py-2 whitespace-nowrap">
                          {slab?.newFundingRound
                            ? fundingLabel(slab.newFundingRound)
                            : "—"}
                          {slab?.fundingSeries && (
                            <span className="block text-[10px]">
                              {slab.fundingSeries}
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-right whitespace-nowrap">
                          {typeof slab?.headCount === "number"
                            ? `${slab.headCount}명`
                            : "—"}
                        </td>
                        <td className="px-3 py-2 text-xs">
                          {slab?.businessHighlight ? (
                            <span
                              className="line-clamp-2 max-w-[20rem] whitespace-pre-wrap"
                              title={slab.businessHighlight}
                            >
                              {slab.businessHighlight}
                            </span>
                          ) : (
                            "—"
                          )}
                        </td>
                        {memoCell}
                        {meetingCell}
                      </tr>
                    );
                  }
                  const metrics = computeMetrics(fin);
                  const health = gradeHealth(fin, metrics);
                  // 월평균차액 = 매출 − 지출 (monthlyBurn 은 소모를 양수로 보므로 부호 반전)
                  const monthlySurplus =
                    metrics.monthlyBurn === null ? null : -metrics.monthlyBurn;
                  return (
                    <tr
                      key={listing.id}
                      {...rowFlags}
                      className="border-b align-top last:border-0"
                    >
                      <td className="px-3 py-2">
                        <HealthBadge
                          level={health.level}
                          reasons={health.reasons}
                          updatedLabel={formatDate(fin.updated_at)}
                        />
                      </td>
                      <td className="px-3 py-2 font-medium">{companyCell}</td>
                      <SubmissionCells sub={sub} slabUrl={slabUrl} />
                      <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">
                        {fin.report_year} · {fin.report_month / 3}분기
                        <span className="block text-[10px]">
                          {fin.source === "slab" ? "slab" : "업로드"}
                        </span>
                        {fin.source_file_url && (
                          <span className="mt-0.5 block">
                            <BoardFileViewer fin={fin} />
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right">{formatWon(metrics.heldCash)}</td>
                      <td className="px-3 py-2 text-right">
                        {formatWon(metrics.monthlyRevenue)}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {formatWon(metrics.monthlySga)}
                      </td>
                      <td
                        className={cn(
                          "px-3 py-2 text-right",
                          surplusClass(monthlySurplus),
                        )}
                      >
                        {formatWon(monthlySurplus)}
                      </td>
                      <td
                        className={cn(
                          "px-3 py-2 text-right whitespace-nowrap",
                          runwayClass(metrics.runwayMonths),
                        )}
                      >
                        {months(metrics.runwayMonths)}
                      </td>
                      <td
                        className={cn(
                          "px-3 py-2 text-right",
                          erosionClass(metrics.capitalErosion),
                        )}
                      >
                        {pct(metrics.capitalErosion)}
                      </td>
                      <td className="px-3 py-2 text-right">{pct(metrics.revenueGrowth)}</td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        {metrics.isProfit ? (
                          <span className="text-emerald-600">흑자</span>
                        ) : (
                          <span className="text-rose-600">적자</span>
                        )}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        {fin.funding_round ? fundingLabel(fin.funding_round) : "—"}
                        {fin.funding_series && (
                          <span className="block text-[10px] text-muted-foreground">
                            {fin.funding_series}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right whitespace-nowrap">
                        {typeof fin.head_count === "number"
                          ? `${fin.head_count}명`
                          : "—"}
                      </td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">
                        {fin.business_highlight ? (
                          <span
                            className="line-clamp-2 max-w-[20rem] whitespace-pre-wrap"
                            title={fin.business_highlight}
                          >
                            {fin.business_highlight}
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                      {memoCell}
                      {meetingCell}
                    </tr>
                  );
                  },
                )}
              </tbody>
            </table>
          </Card>
        )}
      </FinancialsView>
    </div>
  );
}
