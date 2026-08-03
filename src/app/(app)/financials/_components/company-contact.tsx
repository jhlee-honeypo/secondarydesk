"use client";

import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";

export type CompanyContact = {
  ceoName: string | null;
  ceoPhone: string | null;
  ceoEmail: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  extraEmail: string | null;
  extraPhone: string | null;
  lastWriter: string | null;
  lastWriterPeriod: string | null;
};

function Row({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <div className="flex gap-2 text-xs">
      <span className="w-12 shrink-0 text-muted-foreground">{label}</span>
      {/* 드래그로 복사할 수 있도록 링크가 아닌 선택 가능한 평문으로 둔다 */}
      <span className="min-w-0 flex-1 break-all select-text">{value}</span>
    </div>
  );
}

/** 회사명에 마우스를 올리면 slab 에 등록된 대표·담당 연락처를 띄운다(복사 가능한 텍스트). */
export function CompanyContactHover({
  companyName,
  companyNameEn,
  contact,
}: {
  companyName: string;
  companyNameEn: string | null;
  contact: CompanyContact | null;
}) {
  const ceo = contact && (contact.ceoName || contact.ceoPhone || contact.ceoEmail);
  const staff =
    contact &&
    (contact.contactEmail ||
      contact.contactPhone ||
      contact.extraEmail ||
      contact.extraPhone);

  return (
    <HoverCard openDelay={150} closeDelay={120}>
      <HoverCardTrigger asChild>
        <span className="cursor-help underline decoration-dotted underline-offset-4">
          {companyName}
        </span>
      </HoverCardTrigger>
      {companyNameEn && (
        <span className="block text-xs text-muted-foreground">{companyNameEn}</span>
      )}

      <HoverCardContent className="w-80 space-y-2">
        <div className="text-sm font-semibold select-text">{companyName}</div>

        {ceo && (
          <div className="space-y-0.5">
            <div className="text-[10px] font-medium text-muted-foreground">대표</div>
            <Row label="성함" value={contact.ceoName} />
            <Row label="연락처" value={contact.ceoPhone} />
            <Row label="이메일" value={contact.ceoEmail} />
          </div>
        )}

        {staff && (
          <div className="space-y-0.5 border-t pt-2">
            <div className="text-[10px] font-medium text-muted-foreground">담당</div>
            <Row label="이메일" value={contact.contactEmail} />
            <Row label="연락처" value={contact.contactPhone} />
            <Row label="추가메일" value={contact.extraEmail} />
            <Row label="추가연락" value={contact.extraPhone} />
          </div>
        )}

        {contact?.lastWriter && (
          <div className="border-t pt-2">
            <Row
              label="작성자"
              value={`${contact.lastWriter} (${contact.lastWriterPeriod} 보고)`}
            />
          </div>
        )}

        {!ceo && !staff && !contact?.lastWriter && (
          <p className="text-xs text-muted-foreground">
            slab 에 등록된 연락처가 없습니다.
          </p>
        )}
      </HoverCardContent>
    </HoverCard>
  );
}
