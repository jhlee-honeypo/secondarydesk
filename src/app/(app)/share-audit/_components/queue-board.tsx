"use client";

import { useState, useTransition } from "react";
import { FileText, MessageSquare, Trash2 } from "lucide-react";

import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  SearchableSelect,
  type ComboOption,
} from "@/components/app/searchable-select";
import { formatDate } from "@/lib/format";
import type { QueueItem, ReviewStatus } from "../types";
import {
  addShareAuditMemo,
  deleteShareAuditMemo,
  listShareAuditMemos,
  setShareAuditStatus,
  type ShareAuditMemo,
} from "../review-actions";

// slab CDN 원본 PDF를 same-origin·inline 으로 여는 프록시(등기 화면과 동일 경로)
const pdfHref = (url: string) =>
  `/api/financial-file?url=${encodeURIComponent(url)}`;

const fmt = (n: number | null) => (n === null ? "—" : n.toLocaleString("ko-KR"));

const STATUS_LABEL: Record<Exclude<ReviewStatus, "open">, string> = {
  ack: "확인함",
  dismissed: "무시",
};

function fmtTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const p = (x: number) => String(x).padStart(2, "0");
  return `${d.getMonth() + 1}/${d.getDate()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/**
 * 조치 큐 — 발행주식수가 어긋난 기업만 모아 놓고, 확인/무시로 처리 상태를 남기고
 * 메모로 진행을 기록한다. 상태·메모는 팀 공용이라 서버(Supabase)에 저장한다.
 */
export function QueueBoard({
  items,
  fund,
  onFundChange,
  fundOptions,
  currentUserId,
}: {
  items: QueueItem[]; // 이미 조합으로 좁혀진 목록
  fund: string; // "" = 전체 조합. 아래 조합별 현황표와 같은 상태를 공유한다
  onFundChange: (value: string) => void;
  fundOptions: ComboOption[];
  currentUserId: string | null;
}) {
  const [sev, setSev] = useState<"all" | "red" | "yellow">("all");
  const [showDismissed, setShowDismissed] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  // 서버 액션 결과를 낙관적으로 반영하기 위한 로컬 상태(상태값만).
  const [statusOverride, setStatusOverride] = useState<Record<string, ReviewStatus>>({});
  const [memoCountOverride, setMemoCountOverride] = useState<Record<string, number>>({});

  const statusOf = (i: QueueItem): ReviewStatus =>
    statusOverride[i.companyId] ?? i.reviewStatus;
  const memoCountOf = (i: QueueItem): number =>
    memoCountOverride[i.companyId] ?? i.memoCount;

  const inScope = items.filter((i) => sev === "all" || i.severity === sev);

  const visible = inScope.filter(
    (i) => showDismissed || statusOf(i) !== "dismissed",
  );
  const hiddenCount = inScope.filter((i) => statusOf(i) === "dismissed").length;
  const red = inScope.filter((i) => i.severity === "red").length;
  const yellow = inScope.length - red;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-sm font-semibold">
          조치 큐{" "}
          <span className="font-normal text-muted-foreground">
            ({visible.length})
          </span>
        </h2>
        <span className="text-xs text-muted-foreground">
          🔴 조치 {red} · 🟡 확인 {yellow}
        </span>
        {/* 조합 선택 — 아래 조합별 현황표의 행 클릭과 같은 상태를 바꾼다(양방향 동기) */}
        <SearchableSelect
          value={fund}
          onValueChange={onFundChange}
          options={fundOptions}
          placeholder="조합 선택"
          searchPlaceholder="조합 검색"
          ariaLabel="조합"
          triggerClassName="h-8 w-60"
        />
        <div className="flex gap-1">
          <FilterChip
            active={sev === "red"}
            onClick={() => setSev((c) => (c === "red" ? "all" : "red"))}
          >
            🔴 조치만
          </FilterChip>
          <FilterChip
            active={sev === "yellow"}
            onClick={() => setSev((c) => (c === "yellow" ? "all" : "yellow"))}
          >
            🟡 확인만
          </FilterChip>
        </div>
        <button
          type="button"
          onClick={() => setShowDismissed((v) => !v)}
          className="ml-auto rounded-md border px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted"
        >
          {showDismissed
            ? "무시 항목 숨기기"
            : `무시 항목 보기${hiddenCount ? ` (${hiddenCount})` : ""}`}
        </button>
      </div>

      <Card className="overflow-hidden p-0">
        {visible.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            조치할 항목이 없습니다 ✓
          </p>
        ) : (
          <ul className="max-h-[520px] divide-y overflow-y-auto">
            {visible.map((i) => (
              <QueueRow
                key={i.companyId}
                item={i}
                status={statusOf(i)}
                memoCount={memoCountOf(i)}
                open={openId === i.companyId}
                onToggleOpen={() =>
                  setOpenId(openId === i.companyId ? null : i.companyId)
                }
                onStatus={(s) =>
                  setStatusOverride((p) => ({ ...p, [i.companyId]: s }))
                }
                onMemoCount={(n) =>
                  setMemoCountOverride((p) => ({ ...p, [i.companyId]: n }))
                }
                currentUserId={currentUserId}
              />
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-md border px-2.5 py-1 text-xs transition-colors ${
        active
          ? "border-primary bg-primary/10 font-medium text-primary"
          : "text-muted-foreground hover:bg-muted"
      }`}
    >
      {children}
    </button>
  );
}

function QueueRow({
  item,
  status,
  memoCount,
  open,
  onToggleOpen,
  onStatus,
  onMemoCount,
  currentUserId,
}: {
  item: QueueItem;
  status: ReviewStatus;
  memoCount: number;
  open: boolean;
  onToggleOpen: () => void;
  onStatus: (s: ReviewStatus) => void;
  onMemoCount: (n: number) => void;
  currentUserId: string | null;
}) {
  const [memos, setMemos] = useState<ShareAuditMemo[] | null>(null);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // 펼칠 때 메모를 새로 읽는다 — 남이 쓴 글도 바로 보이게.
  function toggle() {
    if (!open && memos === null) {
      startTransition(async () => {
        setMemos(await listShareAuditMemos(item.companyId));
      });
    }
    onToggleOpen();
  }

  function setStatus(next: ReviewStatus) {
    const target = status === next ? "open" : next;
    onStatus(target); // 낙관적 반영
    startTransition(async () => {
      const r = await setShareAuditStatus(item.companyId, target);
      if (!r.ok) {
        setError(r.error);
        onStatus(status); // 되돌린다
      }
    });
  }

  function publish() {
    const body = draft.trim();
    if (!body) return;
    startTransition(async () => {
      const r = await addShareAuditMemo(item.companyId, body);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setDraft("");
      setError(null);
      const next = await listShareAuditMemos(item.companyId);
      setMemos(next);
      onMemoCount(next.length);
    });
  }

  function remove(id: string) {
    startTransition(async () => {
      const r = await deleteShareAuditMemo(id);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      const next = await listShareAuditMemos(item.companyId);
      setMemos(next);
      onMemoCount(next.length);
    });
  }

  return (
    <li className={status === "dismissed" ? "opacity-60" : ""}>
      <div
        onClick={toggle}
        className="flex cursor-pointer items-center gap-2.5 px-3 py-2.5 hover:bg-muted/40"
      >
        <span
          className="w-24 shrink-0 truncate text-[11px] text-muted-foreground"
          title={item.fundLabels.join(", ")}
        >
          {item.fundLabels[0] ?? "—"}
          {item.fundLabels.length > 1 && ` +${item.fundLabels.length - 1}`}
        </span>
        <span className="w-32 shrink-0 truncate text-sm font-medium">
          {item.companyName}
        </span>
        <Badge
          variant={item.severity === "red" ? "destructive" : "outline"}
          className="w-24 shrink-0 justify-center text-[10px]"
        >
          {item.kind}
        </Badge>
        <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
          {item.detail}
        </span>
        {memoCount > 0 && (
          <span className="flex shrink-0 items-center gap-0.5 text-[11px] text-muted-foreground">
            <MessageSquare className="size-3" />
            {memoCount}
          </span>
        )}
        {status !== "open" && (
          <Badge variant="secondary" className="shrink-0 text-[10px]">
            {STATUS_LABEL[status]}
          </Badge>
        )}
        <span className="shrink-0 text-muted-foreground">{open ? "▾" : "▸"}</span>
      </div>

      {open && (
        <div className="space-y-3 border-t bg-muted/30 px-3 py-3 text-xs">
          {/* 근거 — 세 출처를 그대로 나열한다 */}
          <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
            <span className="text-muted-foreground">등기부등본</span>
            <span>
              {fmt(item.registryShares)}주
              {item.registrySharesAsOf &&
                ` · 기준 ${formatDate(item.registrySharesAsOf)}`}
              {item.registryIssueDate &&
                ` · 발행 ${formatDate(item.registryIssueDate)}`}
              {item.registrySourceUrl && (
                <a
                  href={pdfHref(item.registrySourceUrl)}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="ml-2 inline-flex items-center gap-1 text-primary underline"
                >
                  <FileText className="size-3" />
                  PDF 열기
                </a>
              )}
            </span>
            <span className="text-muted-foreground">slab</span>
            <span>{fmt(item.slabShares)}주</span>
            <span className="text-muted-foreground">분기보고</span>
            <span>
              {fmt(item.reportShares)}주
              {item.reportPeriod && ` · ${item.reportPeriod}`}
            </span>
            {item.fundLabels.length > 0 && (
              <>
                <span className="text-muted-foreground">소속 조합</span>
                <span>{item.fundLabels.join(", ")}</span>
              </>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <Button
              size="sm"
              variant={status === "ack" ? "default" : "outline"}
              disabled={pending}
              onClick={() => setStatus("ack")}
              className="h-7 text-xs"
            >
              확인
            </Button>
            <Button
              size="sm"
              variant={status === "dismissed" ? "secondary" : "outline"}
              disabled={pending}
              onClick={() => setStatus("dismissed")}
              className="h-7 text-xs"
            >
              무시
            </Button>
          </div>

          {error && <p className="text-destructive">{error}</p>}

          {/* 메모 — append-only. 수정은 없고(삭제 후 재작성) 삭제는 본인 것만. */}
          <div className="space-y-1.5">
            {memos === null ? (
              <p className="text-muted-foreground">메모를 불러오는 중…</p>
            ) : (
              memos.map((m) => (
                <div key={m.id} className="rounded-md border bg-background px-2.5 py-1.5">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-[11px] font-semibold">{m.author_name}</span>
                    <div className="flex shrink-0 items-center gap-1.5">
                      <span className="text-[10px] text-muted-foreground">
                        {fmtTime(m.created_at)}
                      </span>
                      {currentUserId && m.author_id === currentUserId && (
                        <button
                          type="button"
                          onClick={() => remove(m.id)}
                          disabled={pending}
                          title="삭제"
                          className="text-muted-foreground hover:text-destructive"
                        >
                          <Trash2 className="size-3" />
                        </button>
                      )}
                    </div>
                  </div>
                  <p className="whitespace-pre-wrap">{m.body}</p>
                </div>
              ))
            )}

            <div className="flex items-center gap-1.5 pt-0.5">
              <Input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") publish();
                }}
                placeholder="메모 내용"
                className="h-7 flex-1 text-xs"
              />
              <Button
                size="sm"
                disabled={pending || !draft.trim()}
                onClick={publish}
                className="h-7 text-xs"
              >
                게시
              </Button>
            </div>
          </div>
        </div>
      )}
    </li>
  );
}
