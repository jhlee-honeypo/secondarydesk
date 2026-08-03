"use client";

import { useState, useTransition } from "react";
import { MessageSquare, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  addListingMemo,
  deleteListingMemo,
  listListingMemos,
  type ListingMemo,
} from "../memo-actions";

function when(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** 매물별 메모 스레드. 여는 시점에 서버에서 다시 읽어 다른 사람이 방금 쓴 메모도 보인다. */
export function ListingMemos({
  listingId,
  companyName,
  count,
  currentUserId,
}: {
  listingId: string;
  companyName: string;
  count: number;
  currentUserId: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [memos, setMemos] = useState<ListingMemo[] | null>(null);
  const [body, setBody] = useState("");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  function reload() {
    startTransition(async () => setMemos(await listListingMemos(listingId)));
  }

  function onOpenChange(next: boolean) {
    setOpen(next);
    setError("");
    if (next) reload();
  }

  function submit() {
    const text = body.trim();
    if (!text) return;
    startTransition(async () => {
      const res = await addListingMemo(listingId, text);
      if (!res.ok) return setError(res.error);
      setBody("");
      setError("");
      setMemos(await listListingMemos(listingId));
    });
  }

  function remove(id: string) {
    startTransition(async () => {
      const res = await deleteListingMemo(id);
      if (!res.ok) return setError(res.error);
      setMemos(await listListingMemos(listingId));
    });
  }

  // 다이얼로그를 열어 새로 읽었으면 그 개수를, 아니면 서버 렌더 시점 개수를 쓴다.
  const shown = memos?.length ?? count;

  return (
    <>
      <button
        type="button"
        onClick={() => onOpenChange(true)}
        className={cn(
          "inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs whitespace-nowrap",
          shown > 0
            ? "border-primary/40 text-primary"
            : "text-muted-foreground hover:text-foreground",
        )}
      >
        <MessageSquare className="size-3" />
        {shown > 0 ? shown : "메모"}
      </button>

      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="flex max-h-[80vh] w-[36rem] max-w-[95vw] flex-col">
          <DialogHeader>
            <DialogTitle>{companyName} — 메모</DialogTitle>
          </DialogHeader>

          <div className="space-y-2">
            <Textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="연락 결과·후속 조치 등을 남겨 주세요. (Ctrl+Enter 등록)"
              rows={3}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) submit();
              }}
            />
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-rose-500">{error}</span>
              <Button size="sm" onClick={submit} disabled={pending || !body.trim()}>
                {pending ? "처리 중…" : "등록"}
              </Button>
            </div>
          </div>

          <div className="min-h-0 flex-1 space-y-2 overflow-y-auto border-t pt-3">
            {memos === null ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                불러오는 중…
              </p>
            ) : memos.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                아직 메모가 없습니다.
              </p>
            ) : (
              memos.map((m) => (
                <div key={m.id} className="rounded-md border p-2 text-sm">
                  <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                    <span>
                      <b className="text-foreground">{m.author_name}</b> ·{" "}
                      {when(m.created_at)}
                    </span>
                    {m.author_id && m.author_id === currentUserId && (
                      <button
                        type="button"
                        onClick={() => remove(m.id)}
                        disabled={pending}
                        className="text-muted-foreground hover:text-destructive"
                        aria-label="메모 삭제"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    )}
                  </div>
                  <p className="mt-1 whitespace-pre-wrap">{m.body}</p>
                </div>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
