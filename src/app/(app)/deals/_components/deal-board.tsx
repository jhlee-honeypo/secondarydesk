"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { ArrowRight, Bookmark, CalendarPlus, FileUp, Plus, Trash2, X } from "lucide-react";
import Link from "next/link";

import {
  DEAL_STAGES,
  type DealCard,
  type DealStage,
  type UserRow,
} from "@/lib/types";
import { formatDate, formatShortDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DeleteDialog } from "@/components/app/delete-dialog";
import { SearchableSelect } from "@/components/app/searchable-select";
import { MeetingLogDialog } from "../../activities/_components/meeting-log-dialog";
import {
  DealFormDialog,
  type DealOptionFund,
  type DealOptionInvestor,
  type DealOptionListing,
} from "./deal-form-dialog";
import { deleteDeal, updateDealStage, type ListingBundle } from "../actions";

const ALL = "all";
const VIEWS_KEY = "secondarydesk:deal-views";

// 단계별 색상 — 컬럼 패널 음영/인디케이터/카드 좌측 바를 한 벌로 묶어
// 보드에서 단계 경계가 한눈에 구분되도록 한다(디자인 레퍼런스 기준).
const STAGE_STYLE: Record<
  DealStage,
  { panel: string; accent: string; bar: string }
> = {
  컨택: {
    panel: "border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-900/40",
    accent: "bg-slate-400",
    bar: "bg-slate-300 dark:bg-slate-600",
  },
  기업소개: {
    panel: "border-sky-200 bg-sky-50/70 dark:border-sky-900 dark:bg-sky-950/30",
    accent: "bg-sky-400",
    bar: "bg-sky-300 dark:bg-sky-700",
  },
  "IR·실사": {
    panel: "border-amber-200 bg-amber-50/70 dark:border-amber-900 dark:bg-amber-950/30",
    accent: "bg-amber-400",
    bar: "bg-amber-300 dark:bg-amber-700",
  },
  클로징: {
    panel: "border-emerald-200 bg-emerald-50/70 dark:border-emerald-900 dark:bg-emerald-950/30",
    accent: "bg-emerald-500",
    bar: "bg-emerald-400 dark:bg-emerald-600",
  },
  드랍: {
    panel: "border-rose-200 bg-rose-50/70 dark:border-rose-900 dark:bg-rose-950/30",
    accent: "bg-rose-400",
    bar: "bg-rose-300 dark:bg-rose-700",
  },
};

// 현재 단계에 진입한 일자 — 현재 단계와 같은 단계 이력 중 가장 최근 changed_at.
// 이력이 없으면 빈 문자열(정렬 시 맨 아래로). 카드 정렬·기업소개 경과 판정에 쓴다.
function currentStageDate(deal: DealCard): string {
  let latest = "";
  for (const ev of deal.stage_events ?? []) {
    if (ev.stage === deal.stage && ev.changed_at > latest) latest = ev.changed_at;
  }
  return latest;
}

// todayStr(YYYY-MM-DD) 기준 n개월 전 날짜(YYYY-MM-DD).
function monthsAgo(todayStr: string, n: number): string {
  const d = new Date(todayStr);
  d.setMonth(d.getMonth() - n);
  return d.toISOString().slice(0, 10);
}

type SavedView = { name: string; listing: string; owner: string; fund?: string };

export function DealBoard({
  initialDeals,
  listings,
  investors,
  funds,
  users,
  currentUserId,
  holdingFunds,
  listingFundMap,
  listingBundles,
  showClosed,
}: {
  initialDeals: DealCard[];
  listings: DealOptionListing[];
  investors: DealOptionInvestor[];
  funds: DealOptionFund[];
  users: UserRow[];
  currentUserId: string;
  holdingFunds: { id: string; name: string }[];
  listingFundMap: Record<string, string[]>;
  listingBundles: ListingBundle[];
  showClosed: boolean;
}) {
  const router = useRouter();
  const [deals, setDeals] = useState(initialDeals);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  // 필터 상태(클라이언트 측, 즉시 반영)
  const [listingFilter, setListingFilter] = useState(ALL);
  const [ownerFilter, setOwnerFilter] = useState(ALL);
  const [fundFilter, setFundFilter] = useState(ALL);

  // 저장된 뷰(F9) — localStorage 영속
  const [views, setViews] = useState<SavedView[]>([]);
  const [viewName, setViewName] = useState("");

  // 생성/수정/삭제 후 revalidate 로 새 props 가 오면 보드 동기화
  useEffect(() => {
    setDeals(initialDeals);
  }, [initialDeals]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(VIEWS_KEY);
      if (raw) setViews(JSON.parse(raw) as SavedView[]);
    } catch {
      // 무시(파싱 실패 시 빈 목록)
    }
  }, []);

  function persistViews(next: SavedView[]) {
    setViews(next);
    try {
      localStorage.setItem(VIEWS_KEY, JSON.stringify(next));
    } catch {
      // 무시
    }
  }

  function saveCurrentView() {
    const name = viewName.trim();
    if (!name) return;
    persistViews([
      ...views.filter((v) => v.name !== name),
      { name, listing: listingFilter, owner: ownerFilter, fund: fundFilter },
    ]);
    setViewName("");
  }

  const filterActive =
    listingFilter !== ALL || ownerFilter !== ALL || fundFilter !== ALL;

  // 매물 필터 드롭다운 후보 — 펀드가 선택돼 있으면 그 펀드 소속 매물만 노출.
  const listingsForFilter =
    fundFilter === ALL
      ? listings
      : listings.filter((l) =>
          (listingFundMap[l.id] ?? []).includes(fundFilter),
        );

  // 펀드 필터 변경 시, 선택돼 있던 매물이 새 펀드에 속하지 않으면 매물 필터 해제
  // (드롭다운 후보에서 사라진 값이 그대로 남는 것 방지).
  function handleFundFilterChange(next: string) {
    setFundFilter(next);
    if (
      next !== ALL &&
      listingFilter !== ALL &&
      !(listingFundMap[listingFilter] ?? []).includes(next)
    ) {
      setListingFilter(ALL);
    }
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  const todayStr = new Date().toISOString().slice(0, 10);

  const visible = deals.filter(
    (d) =>
      (fundFilter === ALL ||
        (listingFundMap[d.listing_id] ?? []).includes(fundFilter)) &&
      (listingFilter === ALL || d.listing_id === listingFilter) &&
      (ownerFilter === ALL || d.owner_id === ownerFilter),
  );

  function handleDragStart(e: DragStartEvent) {
    setActiveId(String(e.active.id));
  }

  function handleDragEnd(e: DragEndEvent) {
    setActiveId(null);
    const dealId = String(e.active.id);
    const overStage = e.over?.id ? (String(e.over.id) as DealStage) : null;
    if (!overStage) return;

    const deal = deals.find((d) => d.id === dealId);
    if (!deal || deal.stage === overStage) return;

    const prevStage = deal.stage;
    // 낙관적 업데이트
    setDeals((cur) =>
      cur.map((d) => (d.id === dealId ? { ...d, stage: overStage } : d)),
    );

    startTransition(async () => {
      const res = await updateDealStage(dealId, overStage);
      if (!res.ok) {
        // 실패 시 롤백
        setDeals((cur) =>
          cur.map((d) => (d.id === dealId ? { ...d, stage: prevStage } : d)),
        );
      }
    });
  }

  const activeDeal = activeId ? deals.find((d) => d.id === activeId) : null;

  const dialogOptions = {
    listings,
    investors,
    funds,
    users,
    currentUserId,
    holdingFunds,
    listingFundMap,
    listingBundles,
  };

  return (
    <div className="space-y-4">
      {/* 필터 행 + 딜 생성 */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Select value={fundFilter} onValueChange={handleFundFilterChange}>
            <SelectTrigger className="w-44" aria-label="운용펀드 필터">
              <SelectValue placeholder="운용펀드" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>전체 운용펀드</SelectItem>
              {holdingFunds.map((f) => (
                <SelectItem key={f.id} value={f.id}>
                  {f.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <SearchableSelect
            ariaLabel="매물 필터"
            triggerClassName="w-48"
            value={listingFilter}
            onValueChange={setListingFilter}
            placeholder="매물"
            searchPlaceholder="매물명 검색…"
            emptyText="매물 없음"
            options={[
              { value: ALL, label: "전체 매물" },
              ...listingsForFilter.map((l) => ({
                value: l.id,
                label: l.company_name,
              })),
            ]}
          />

          <Select value={ownerFilter} onValueChange={setOwnerFilter}>
            <SelectTrigger className="w-44" aria-label="담당자 필터">
              <SelectValue placeholder="담당자" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>전체 담당자</SelectItem>
              {users.map((u) => (
                <SelectItem key={u.id} value={u.id}>
                  {u.name ?? u.email ?? u.id}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button
            type="button"
            variant={showClosed ? "secondary" : "outline"}
            onClick={() => router.push(showClosed ? "/deals" : "/deals?closed=1")}
            title="기본은 진행 중 딜만 표시합니다. 종료(클로징·드랍)된 딜까지 보려면 켜세요."
          >
            {showClosed ? "진행 중만" : "종료 딜 포함"}
          </Button>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" asChild>
            <Link href="/deals/import">
              <FileUp />
              가져오기
            </Link>
          </Button>
          <MeetingLogDialog
            investors={investors}
            trigger={
              <Button variant="outline">
                <CalendarPlus />
                미팅 기록
              </Button>
            }
          />
          <DealFormDialog
            {...dialogOptions}
            initialFundFilter={fundFilter}
            trigger={
              <Button>
                <Plus />딜
              </Button>
            }
          />
        </div>
      </div>

      {/* 저장된 뷰(F9) */}
      <div className="flex flex-wrap items-center gap-2">
        <Bookmark className="size-4 text-muted-foreground" />
        {views.length === 0 && (
          <span className="text-xs text-muted-foreground">
            필터를 조합한 뒤 이름을 붙여 저장하면 여기서 재사용할 수 있습니다.
          </span>
        )}
        {views.map((v) => (
          <span
            key={v.name}
            className="inline-flex items-center gap-1 rounded-full border border-border bg-card py-0.5 pl-2.5 pr-1 text-xs"
          >
            <button
              type="button"
              className="font-medium hover:text-primary"
              onClick={() => {
                setListingFilter(v.listing);
                setOwnerFilter(v.owner);
                setFundFilter(v.fund ?? ALL);
              }}
            >
              {v.name}
            </button>
            <button
              type="button"
              aria-label={`${v.name} 뷰 삭제`}
              className="rounded-full p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
              onClick={() => persistViews(views.filter((x) => x.name !== v.name))}
            >
              <X className="size-3" />
            </button>
          </span>
        ))}
        {filterActive && (
          <div className="flex items-center gap-1">
            <Input
              value={viewName}
              onChange={(e) => setViewName(e.target.value)}
              placeholder="현재 필터 이름"
              className="h-7 w-36 text-xs"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  saveCurrentView();
                }
              }}
            />
            <Button
              type="button"
              size="xs"
              variant="outline"
              disabled={!viewName.trim()}
              onClick={saveCurrentView}
            >
              저장
            </Button>
          </div>
        )}
      </div>

      {/* 칸반 컬럼 */}
      <DndContext
        sensors={sensors}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div className="grid grid-cols-2 gap-3 pb-4 sm:grid-cols-3 lg:grid-cols-5">
          {DEAL_STAGES.map((stage) => (
            <Column
              key={stage}
              stage={stage}
              deals={visible.filter((d) => d.stage === stage)}
              todayStr={todayStr}
              dialogOptions={dialogOptions}
            />
          ))}
        </div>

        <DragOverlay>
          {activeDeal ? (
            <DealCardView deal={activeDeal} todayStr={todayStr} dragging />
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}

function Column({
  stage,
  deals,
  todayStr,
  dialogOptions,
}: {
  stage: DealStage;
  deals: DealCard[];
  todayStr: string;
  dialogOptions: {
    listings: DealOptionListing[];
    investors: DealOptionInvestor[];
    funds: DealOptionFund[];
    users: UserRow[];
    currentUserId: string;
  };
}) {
  const { setNodeRef, isOver } = useDroppable({ id: stage });
  const style = STAGE_STYLE[stage];

  // 현재 단계 진입일 기준 정렬 — 최신 일정이 위로, 오래된 일정이 아래로.
  const ordered = [...deals].sort((a, b) => {
    const da = currentStageDate(a);
    const db = currentStageDate(b);
    return da > db ? -1 : da < db ? 1 : 0;
  });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex min-w-0 flex-col rounded-xl border p-2 transition-colors",
        style.panel,
        isOver && "ring-2 ring-primary/50",
      )}
    >
      <div className="mb-2 flex items-center justify-between px-1 pt-0.5">
        <span className="flex items-center gap-2 text-sm font-medium">
          <span
            className={cn("h-4 w-1.5 shrink-0 rounded-full", style.accent)}
            aria-hidden
          />
          {stage}
        </span>
        <span className="rounded-full border border-border bg-card px-2 py-0.5 text-[10px] font-semibold tabular-nums text-muted-foreground">
          {deals.length}
        </span>
      </div>
      <div className="flex min-h-24 flex-1 flex-col gap-2">
        {ordered.map((deal) => (
          <DraggableCard
            key={deal.id}
            deal={deal}
            todayStr={todayStr}
            dialogOptions={dialogOptions}
          />
        ))}
        {deals.length === 0 && (
          <p className="px-1 py-2 text-xs text-muted-foreground/70">비어 있음</p>
        )}
      </div>
    </div>
  );
}

function DraggableCard({
  deal,
  todayStr,
  dialogOptions,
}: {
  deal: DealCard;
  todayStr: string;
  dialogOptions: {
    listings: DealOptionListing[];
    investors: DealOptionInvestor[];
    funds: DealOptionFund[];
    users: UserRow[];
    currentUserId: string;
  };
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: deal.id,
  });

  // 카드 클릭 → 딜 수정(제어형 다이얼로그). 드래그와 구분하기 위해
  // pointerdown 좌표를 기록하고, 클릭 시 이동량이 작을 때만 수정을 연다.
  const [editOpen, setEditOpen] = useState(false);
  const downPos = useRef<{ x: number; y: number } | null>(null);

  return (
    <>
      <div
        ref={setNodeRef}
        {...attributes}
        {...listeners}
        onPointerDown={(e) => {
          downPos.current = { x: e.clientX, y: e.clientY };
          listeners?.onPointerDown?.(e);
        }}
        onClick={(e) => {
          const start = downPos.current;
          // 6px 넘게 움직였으면 드래그로 보고 수정 열지 않음
          if (
            start &&
            (Math.abs(e.clientX - start.x) > 5 ||
              Math.abs(e.clientY - start.y) > 5)
          ) {
            return;
          }
          setEditOpen(true);
        }}
        className={cn(
          "cursor-pointer touch-none",
          isDragging && "opacity-40",
        )}
      >
        <DealCardView deal={deal} todayStr={todayStr} dialogOptions={dialogOptions} />
      </div>
      <DealFormDialog
        {...dialogOptions}
        deal={deal}
        open={editOpen}
        onOpenChange={setEditOpen}
      />
    </>
  );
}

function DealCardView({
  deal,
  todayStr,
  dragging,
  dialogOptions,
}: {
  deal: DealCard;
  todayStr: string;
  dragging?: boolean;
  dialogOptions?: {
    listings: DealOptionListing[];
    investors: DealOptionInvestor[];
    funds: DealOptionFund[];
    users: UserRow[];
    currentUserId: string;
  };
}) {
  const overdue =
    !!deal.next_action_date &&
    deal.next_action_date < todayStr &&
    deal.stage !== "클로징" &&
    deal.stage !== "드랍";

  // 단계 진입 이력(오래된 순). 마지막 항목 = 현재 단계.
  const stageHistory = [...(deal.stage_events ?? [])].sort((a, b) =>
    a.changed_at < b.changed_at ? -1 : a.changed_at > b.changed_at ? 1 : 0,
  );

  // 기업소개 단계에서 현재 단계 진입일이 2개월 넘게 지난 딜 — 사실상 드랍으로
  // 보고 음영 처리(기업소개에만 적용). 진입일 이력이 없으면 판정하지 않음.
  const introStageDate = currentStageDate(deal).slice(0, 10);
  const staleIntro =
    deal.stage === "기업소개" &&
    introStageDate !== "" &&
    introStageDate < monthsAgo(todayStr, 2);

  return (
    <div
      title={
        staleIntro ? "기업소개 2개월 경과 — 사실상 드랍 검토" : undefined
      }
      className={cn(
        "group relative rounded-lg border border-border bg-card text-sm shadow-xs",
        dragging && "cursor-grabbing shadow-md",
        staleIntro && "border-dashed bg-muted/70 opacity-90",
      )}
    >
      {/* 단계 색상 좌측 바 — 컬럼 음영과 함께 단계 구분을 보강 */}
      <span
        className={cn(
          "absolute inset-y-2 left-0 w-1 rounded-r",
          STAGE_STYLE[deal.stage].bar,
        )}
        aria-hidden
      />
      {/* 헤더(항상 표시): 매물명 → 투자사명 */}
      <div className="flex items-center gap-1.5 py-2 pl-3.5 pr-3">
        <span className="min-w-0 flex-1 truncate leading-tight">
          <span className="font-medium text-foreground">
            {deal.listing?.company_name ?? "—"}
          </span>
          <ArrowRight className="mx-1 inline-block size-3 align-middle text-muted-foreground/40" />
          <span className="text-muted-foreground">
            {deal.investor?.name ?? "—"}
          </span>
        </span>
        {dialogOptions && (
          <div
            className="shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
          >
            <DeleteDialog
              trigger={
                <Button variant="ghost" size="icon-xs" aria-label="딜 삭제">
                  <Trash2 />
                </Button>
              }
              title="딜을 삭제할까요?"
              description={`'${deal.listing?.company_name ?? ""} × ${deal.investor?.name ?? ""}' 딜을 삭제합니다.`}
              action={deleteDeal.bind(null, deal.id, undefined)}
            />
          </div>
        )}
      </div>

      {/* 상세(호버 시 높이가 부드럽게 펼쳐짐 — grid-rows 0fr→1fr) */}
      <div className="grid grid-rows-[0fr] transition-[grid-template-rows] duration-200 ease-out group-hover:grid-rows-[1fr]">
        <div className="overflow-hidden">
          <div className="pb-3 pl-3.5 pr-3">
            <div className="flex items-center justify-end text-xs text-muted-foreground">
              <span>
                {deal.owner?.first_name ??
                  deal.owner?.name ??
                  deal.owner?.email ??
                  "—"}
              </span>
            </div>

            {deal.next_action && (
              <div className="mt-2 flex items-center gap-1.5 border-t border-border pt-2 text-xs">
                {overdue && (
                  <span
                    className="size-1.5 shrink-0 rounded-full bg-destructive"
                    aria-label="기한 경과"
                  />
                )}
                <span
                  className={cn(
                    "truncate",
                    overdue ? "text-destructive" : "text-muted-foreground",
                  )}
                >
                  {deal.next_action}
                  {deal.next_action_date &&
                    ` · ${formatDate(deal.next_action_date)}`}
                </span>
              </div>
            )}

            {/* 단계 이력 미니 타임라인 — 단계가 바뀔 때마다 진입일 누적 */}
            {stageHistory.length > 0 && (
              <div className="mt-2 space-y-1 border-t border-border pt-2">
          {stageHistory.map((ev, i) => {
            const isCurrent = i === stageHistory.length - 1;
            return (
              <div
                key={`${ev.stage}-${ev.changed_at}-${i}`}
                className="flex items-center gap-1.5 text-xs"
              >
                <span
                  className={cn(
                    "size-1.5 shrink-0 rounded-full",
                    isCurrent ? "bg-primary" : "bg-transparent",
                  )}
                  aria-hidden
                />
                <span
                  className={cn(
                    "flex-1 truncate",
                    isCurrent
                      ? "font-medium text-foreground"
                      : "text-muted-foreground",
                  )}
                >
                  {ev.stage}
                </span>
                <span className="shrink-0 tabular-nums text-muted-foreground">
                  {formatShortDate(ev.changed_at)}
                </span>
              </div>
            );
          })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
