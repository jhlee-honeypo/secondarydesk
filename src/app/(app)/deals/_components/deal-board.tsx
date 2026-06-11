"use client";

import { useEffect, useRef, useState, useTransition } from "react";
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
import { ArrowRight, Bookmark, CalendarPlus, Plus, Trash2, X } from "lucide-react";

import {
  DEAL_STAGES,
  DEAL_STAGE_VARIANT,
  type DealCard,
  type DealStage,
  type UserRow,
} from "@/lib/types";
import { formatDate, formatShortDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
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
import { MeetingLogDialog } from "../../activities/_components/meeting-log-dialog";
import {
  DealFormDialog,
  type DealOptionFund,
  type DealOptionInvestor,
  type DealOptionListing,
} from "./deal-form-dialog";
import { deleteDeal, updateDealStage } from "../actions";

const ALL = "all";
const VIEWS_KEY = "secondarydesk:deal-views";

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
}: {
  initialDeals: DealCard[];
  listings: DealOptionListing[];
  investors: DealOptionInvestor[];
  funds: DealOptionFund[];
  users: UserRow[];
  currentUserId: string;
  holdingFunds: { id: string; name: string }[];
  listingFundMap: Record<string, string[]>;
}) {
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
  };

  return (
    <div className="space-y-4">
      {/* 필터 행 + 딜 생성 */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Select value={fundFilter} onValueChange={setFundFilter}>
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

          <Select value={listingFilter} onValueChange={setListingFilter}>
            <SelectTrigger className="w-48" aria-label="매물 필터">
              <SelectValue placeholder="매물" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>전체 매물</SelectItem>
              {listings.map((l) => (
                <SelectItem key={l.id} value={l.id}>
                  {l.company_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

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
        </div>

        <div className="flex items-center gap-2">
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

  return (
    <div className="flex min-w-0 flex-col">
      <div className="mb-2 flex items-center justify-between px-1">
        <span className="flex items-center gap-2 text-sm font-medium">
          <Badge variant={DEAL_STAGE_VARIANT[stage]}>{stage}</Badge>
        </span>
        <span className="text-xs text-muted-foreground">{deals.length}</span>
      </div>
      <div
        ref={setNodeRef}
        className={cn(
          "flex min-h-24 flex-1 flex-col gap-2 rounded-lg bg-muted/40 p-2 transition-colors",
          isOver && "bg-primary/10 ring-1 ring-primary/40",
        )}
      >
        {deals.map((deal) => (
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

  return (
    <div
      className={cn(
        "group rounded-lg border border-border bg-card text-sm shadow-xs",
        dragging && "cursor-grabbing shadow-md",
      )}
    >
      {/* 헤더(항상 표시): 매물명 → 투자사명 */}
      <div className="flex items-center gap-1.5 px-3 py-2">
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
          <div className="px-3 pb-3">
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
