import Link from "next/link";
import {
  CalendarPlus,
  FileText,
  Mail,
  MessageSquare,
  Phone,
  Presentation,
  Send,
  StickyNote,
  Users,
  type LucideIcon,
} from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import { formatDateTime } from "@/lib/format";
import { type ActivityCard, type ActivityType } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ActivityFilters } from "./_components/activity-filters";
import { MeetingLogDialog } from "./_components/meeting-log-dialog";

export const dynamic = "force-dynamic";

const TYPE_ICON: Record<ActivityType, LucideIcon> = {
  미팅: Users,
  통화: Phone,
  이메일: Mail,
  메신저: MessageSquare,
  자료발송: Send,
  IR: Presentation,
  노트: StickyNote,
};

const LIMIT = 300;

// 전체 활동 피드 카드 — 투자사 단위 타임라인과 달리 투자사명을 함께 노출한다.
type FeedActivity = ActivityCard & {
  investor: { id: string; name: string } | null;
};

// 기간 필터(N일 전) → "YYYY-MM-DD" 컷오프. occurred_at(date/ISO 혼재)과 문자열 비교 가능.
function cutoffFromPeriod(period: string): string | null {
  const days = Number(period);
  if (!Number.isFinite(days) || days <= 0) return null;
  const d = new Date();
  d.setDate(d.getDate() - days);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

export default async function ActivitiesPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; period?: string; investor?: string }>;
}) {
  const sp = await searchParams;
  const type = sp.type ?? "";
  const period = sp.period ?? "";
  const investor = sp.investor ?? "";

  const supabase = await createClient();

  let query = supabase
    .from("activities")
    .select(
      "*, author:users(name, email), contact:contacts(name), deal:deals(id, listing:listings(company_name)), investor:investors(id, name)",
    )
    .order("occurred_at", { ascending: false })
    .limit(LIMIT);

  if (type) query = query.eq("type", type);
  if (investor) query = query.eq("investor_id", investor);
  const cutoff = cutoffFromPeriod(period);
  if (cutoff) query = query.gte("occurred_at", cutoff);

  const [{ data: activityRows }, { data: investorRows }] = await Promise.all([
    query,
    supabase.from("investors").select("id, name").order("name"),
  ]);

  const activities = (activityRows ?? []) as FeedActivity[];
  const investors = (investorRows ?? []) as { id: string; name: string }[];

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">미팅 기록</h1>
          <p className="text-sm text-muted-foreground">
            투자사와의 미팅·컨택 이력이 모두 여기에 시간순으로 쌓입니다. 딜
            보드에서 남긴 기록도 함께 모입니다.
          </p>
        </div>
        <MeetingLogDialog
          investors={investors}
          trigger={
            <Button size="sm" className="shrink-0">
              <CalendarPlus />
              미팅 기록
            </Button>
          }
        />
      </div>

      <ActivityFilters
        investors={investors}
        type={type}
        period={period}
        investor={investor}
      />

      <p className="text-xs text-muted-foreground">
        {activities.length === LIMIT
          ? `최근 ${LIMIT}건 표시 — 더 좁히려면 필터를 사용하세요.`
          : `${activities.length}건`}
      </p>

      {activities.length === 0 ? (
        <Card className="items-center justify-center py-12 text-center">
          <p className="text-sm text-muted-foreground">
            조건에 맞는 활동이 없습니다. 딜 보드의 “미팅 기록”이나 투자사 상세의
            “활동 기록”으로 이력을 남겨보세요.
          </p>
        </Card>
      ) : (
        <ol className="space-y-3">
          {activities.map((a) => {
            const Icon = TYPE_ICON[a.type] ?? FileText;
            return (
              <li key={a.id}>
                <Card size="sm" className="flex-row gap-3 p-3">
                  <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                    <Icon className="size-4" />
                  </div>
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline">{a.type}</Badge>
                      {a.investor && (
                        <Link
                          href={`/investors/${a.investor.id}`}
                          className="text-sm font-medium text-foreground hover:text-primary hover:underline"
                        >
                          {a.investor.name}
                        </Link>
                      )}
                      <span className="text-xs text-muted-foreground">
                        {formatDateTime(a.occurred_at)}
                      </span>
                      {a.contact?.name && (
                        <span className="text-xs text-muted-foreground">
                          · {a.contact.name}
                        </span>
                      )}
                      {a.deal?.listing?.company_name && (
                        <Badge variant="secondary">
                          {a.deal.listing.company_name}
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm whitespace-pre-wrap text-foreground">
                      {a.content}
                    </p>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span>{a.author?.name ?? a.author?.email ?? "—"}</span>
                      {a.attachment_url && (
                        <a
                          href={a.attachment_url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-primary hover:underline"
                        >
                          첨부 열기
                        </a>
                      )}
                    </div>
                  </div>
                </Card>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
