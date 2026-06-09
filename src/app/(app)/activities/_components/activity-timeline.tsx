import {
  FileText,
  Mail,
  MessageSquare,
  Phone,
  Presentation,
  Send,
  StickyNote,
  Trash2,
  Users,
  type LucideIcon,
} from "lucide-react";

import { type ActivityCard, type ActivityType } from "@/lib/types";
import { formatDateTime } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DeleteDialog } from "@/components/app/delete-dialog";
import { deleteActivity } from "../actions";

const TYPE_ICON: Record<ActivityType, LucideIcon> = {
  미팅: Users,
  통화: Phone,
  이메일: Mail,
  메신저: MessageSquare,
  자료발송: Send,
  IR: Presentation,
  노트: StickyNote,
};

export function ActivityTimeline({
  activities,
  investorId,
}: {
  activities: ActivityCard[];
  investorId: string;
}) {
  if (activities.length === 0) {
    return (
      <Card className="items-center justify-center py-12 text-center">
        <p className="text-sm text-muted-foreground">
          아직 기록된 활동이 없습니다. 오른쪽 위 “활동 기록”으로 첫 이력을
          남겨보세요.
        </p>
      </Card>
    );
  }

  return (
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
              <DeleteDialog
                trigger={
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    aria-label="활동 삭제"
                    className="shrink-0"
                  >
                    <Trash2 />
                  </Button>
                }
                title="활동을 삭제할까요?"
                description="이 활동 기록을 삭제합니다. 되돌릴 수 없습니다."
                action={deleteActivity.bind(null, a.id, investorId)}
              />
            </Card>
          </li>
        );
      })}
    </ol>
  );
}
