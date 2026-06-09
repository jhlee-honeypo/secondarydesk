import Link from "next/link";

import { createClient } from "@/lib/supabase/server";
import {
  LISTING_STATUS_LABEL,
  LISTING_STATUS_VARIANT,
  type Contact,
  type Investor,
  type Listing,
} from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { HeaderSearch } from "@/components/app/header-search";

export const dynamic = "force-dynamic";

type ContactHit = Contact & {
  investor: { id: string; name: string } | null;
};

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q = "" } = await searchParams;
  const term = q.trim();

  let investors: Investor[] = [];
  let listings: Listing[] = [];
  let contacts: ContactHit[] = [];

  if (term) {
    const supabase = await createClient();
    const like = `%${term}%`;
    const [inv, lst, con] = await Promise.all([
      supabase.from("investors").select("*").ilike("name", like).order("name"),
      supabase
        .from("listings")
        .select("*")
        .ilike("company_name", like)
        .order("company_name"),
      supabase
        .from("contacts")
        .select("*, investor:investors(id, name)")
        .ilike("name", like)
        .order("name"),
    ]);
    investors = (inv.data ?? []) as Investor[];
    listings = (lst.data ?? []) as Listing[];
    contacts = (con.data ?? []) as ContactHit[];
  }

  const total = investors.length + listings.length + contacts.length;

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6">
      <div className="space-y-3">
        <h1 className="text-2xl font-semibold tracking-tight">검색</h1>
        <HeaderSearch defaultValue={term} />
      </div>

      {!term ? (
        <p className="text-sm text-muted-foreground">
          투자사·매물·컨택 이름으로 검색하세요.
        </p>
      ) : total === 0 ? (
        <Card className="items-center justify-center py-12 text-center">
          <p className="text-sm text-muted-foreground">
            “{term}”에 대한 결과가 없습니다.
          </p>
        </Card>
      ) : (
        <div className="space-y-6">
          <Section title="투자사" count={investors.length}>
            {investors.map((i) => (
              <Row key={i.id} href={`/investors/${i.id}`} label={i.name}>
                {i.type && <Badge variant="outline">{i.type}</Badge>}
              </Row>
            ))}
          </Section>

          <Section title="매물" count={listings.length}>
            {listings.map((l) => (
              <Row
                key={l.id}
                href={`/listings/${l.id}`}
                label={l.company_name}
              >
                <Badge variant={LISTING_STATUS_VARIANT[l.status]}>
                  {LISTING_STATUS_LABEL[l.status]}
                </Badge>
              </Row>
            ))}
          </Section>

          <Section title="컨택" count={contacts.length}>
            {contacts.map((c) => (
              <Row
                key={c.id}
                href={c.investor ? `/investors/${c.investor.id}` : "#"}
                label={c.name}
              >
                <span className="text-xs text-muted-foreground">
                  {c.title ? `${c.title} · ` : ""}
                  {c.investor?.name ?? "—"}
                </span>
              </Row>
            ))}
          </Section>
        </div>
      )}
    </div>
  );
}

function Section({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: React.ReactNode;
}) {
  if (count === 0) return null;
  return (
    <div className="space-y-2">
      <h2 className="text-sm font-medium text-muted-foreground">
        {title} ({count})
      </h2>
      <Card className="p-0">{children}</Card>
    </div>
  );
}

function Row({
  href,
  label,
  children,
}: {
  href: string;
  label: string;
  children?: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="flex items-center justify-between gap-3 border-b border-border px-4 py-3 last:border-0 hover:bg-muted/40"
    >
      <span className="font-medium text-foreground">{label}</span>
      {children}
    </Link>
  );
}
