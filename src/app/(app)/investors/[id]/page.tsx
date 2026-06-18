import Link from "next/link";
import { notFound } from "next/navigation";
import { Pencil, Plus, Star, Trash2 } from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/supabase/auth";
import {
  DEAL_STAGE_VARIANT,
  type ActivityCard,
  type Contact,
  type DealCard,
  type Fund,
  type InvestorWithOwner,
  type UserRow,
} from "@/lib/types";
import { formatDate, formatKRW } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { InvestorFormDialog } from "../_components/investor-form-dialog";
import { FundFormDialog } from "../_components/fund-form-dialog";
import { FundDryPowderCell } from "../_components/fund-dry-powder-cell";
import { DryPowderInfo } from "../_components/dry-powder-info";
import { ContactFormDialog } from "../_components/contact-form-dialog";
import { DeleteDialog } from "@/components/app/delete-dialog";
import { DealFormDialog } from "../../deals/_components/deal-form-dialog";
import { deleteDeal } from "../../deals/actions";
import { ActivityFormDialog } from "../../activities/_components/activity-form-dialog";
import { ActivityTimeline } from "../../activities/_components/activity-timeline";
import { deleteContact, deleteFund, deleteInvestor } from "../actions";

export const dynamic = "force-dynamic";

export default async function InvestorDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const me = await getCurrentUser();

  const [
    { data: investorRow },
    { data: fundRows },
    { data: contactRows },
    { data: userRows },
    { data: dealRows },
    { data: listingRows },
    { data: activityRows },
  ] = await Promise.all([
    supabase.from("investors").select("*").eq("id", id).single(),
    supabase.from("funds").select("*").eq("investor_id", id).order("name"),
    supabase
      .from("contacts")
      .select("*")
      .eq("investor_id", id)
      .order("created_at"),
    supabase.from("users").select("id, name, email, role").order("name"),
    supabase
      .from("deals")
      .select(
        "*, listing:listings(id, company_name), investor:investors(id, name), owner:users(id, name, email)",
      )
      .eq("investor_id", id)
      .order("created_at", { ascending: false }),
    supabase.from("listings").select("id, company_name").order("company_name"),
    supabase
      .from("activities")
      .select(
        "*, author:users(name, email), contact:contacts(name), deal:deals(id, listing:listings(company_name))",
      )
      .eq("investor_id", id)
      .order("occurred_at", { ascending: false }),
  ]);

  if (!investorRow) notFound();

  const investor = investorRow as InvestorWithOwner;
  const funds = (fundRows ?? []) as Fund[];
  const contacts = (contactRows ?? []) as Contact[];
  const users = (userRows ?? []) as UserRow[];
  const deals = (dealRows ?? []) as DealCard[];
  const listingOptions = (listingRows ?? []) as {
    id: string;
    company_name: string;
  }[];

  // 이 투자사로 잠긴 딜 다이얼로그에 넘길 옵션
  const dealDialogProps = {
    listings: listingOptions,
    investors: [{ id: investor.id, name: investor.name }],
    funds: funds.map((f) => ({
      id: f.id,
      name: f.name,
      investor_id: investor.id,
    })),
    users,
    currentUserId: me?.id ?? "",
    lockInvestorId: investor.id,
  };

  const activities = (activityRows ?? []) as ActivityCard[];
  const activityContacts = contacts.map((c) => ({ id: c.id, name: c.name }));
  const activityDeals = deals.map((d) => ({
    id: d.id,
    label: d.listing?.company_name ?? "딜",
  }));

  // 조합 결성약정총액 합
  const aumSum = funds.reduce((s, f) => s + (f.aum ?? 0), 0);

  // 운용 조합은 등록연도(vintage) 최신순 — 올해 포함 직전 2개 연도(=최근 3개 vintage)에
  // 결성된 조합은 미소진 재원이 남아 있을 수 있어 배경 하이라이트. vintage 없는 조합은 맨 아래.
  const currentYear = new Date().getFullYear();
  const HIGHLIGHT_FROM = currentYear - 2;
  const sortedFunds = [...funds].sort((a, b) => {
    const av = a.vintage ?? -Infinity;
    const bv = b.vintage ?? -Infinity;
    if (av !== bv) return bv - av;
    return a.name.localeCompare(b.name, "ko");
  });
  const hasRecentFund = funds.some(
    (f) => typeof f.vintage === "number" && f.vintage >= HIGHLIGHT_FROM,
  );

  return (
    <div className="mx-auto w-full max-w-5xl space-y-8">
      <Link
        href="/investors"
        className="text-sm text-muted-foreground hover:text-foreground"
      >
        ← 투자사 목록
      </Link>

      {/* 헤더 */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">
            {investor.name}
          </h1>
          {investor.type && <Badge variant="outline">{investor.type}</Badge>}
        </div>

        <div className="flex items-center gap-2">
          <InvestorFormDialog
            trigger={
              <Button variant="outline" size="sm">
                <Pencil />
                정보 수정
              </Button>
            }
            investor={investor}
            users={users}
            currentUserId={me?.id ?? ""}
          />
          <DeleteDialog
            trigger={
              <Button variant="outline" size="icon-sm" aria-label="투자사 삭제">
                <Trash2 />
              </Button>
            }
            title="투자사를 삭제할까요?"
            description="이 투자사와 소속 조합·컨택·딜·활동이 모두 함께 삭제됩니다. 되돌릴 수 없습니다."
            action={deleteInvestor.bind(null, investor.id)}
          />
        </div>
      </div>

      {/* 개요 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">개요</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <p className="whitespace-pre-wrap text-foreground">
            {investor.description ?? (
              <span className="text-muted-foreground">
                아직 등록된 개요·성향 메모가 없습니다.
              </span>
            )}
          </p>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-muted-foreground sm:grid-cols-3">
            <div>
              <dt className="text-xs">유형</dt>
              <dd className="text-foreground">{investor.type ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-xs">만난 일자</dt>
              <dd className="text-foreground">
                {investor.met_date ? formatDate(investor.met_date) : "—"}
              </dd>
            </div>
            <div>
              <dt className="text-xs">조합 / 결성약정총액 합</dt>
              <dd className="text-foreground">
                {funds.length}개 · {formatKRW(aumSum)}
              </dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      {/* 운용 조합 */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold tracking-tight">
            운용 조합{" "}
            <span className="text-sm font-normal text-muted-foreground">
              ({funds.length})
            </span>
          </h2>
          <div className="flex items-center gap-1">
            <DryPowderInfo />
            <FundFormDialog
              investorId={investor.id}
              trigger={
                <Button size="sm">
                  <Plus />
                  조합
                </Button>
              }
            />
          </div>
        </div>

        {hasRecentFund && (
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="inline-block size-2.5 rounded-sm bg-emerald-200 dark:bg-emerald-900" />
            강조 = 최근 3개 연도({HIGHLIGHT_FROM}–{currentYear}) 결성 — 미소진 재원이 남아 있을 수 있음
          </p>
        )}

        {funds.length === 0 ? (
          <Card className="items-center justify-center py-12 text-center">
            <p className="text-sm text-muted-foreground">
              등록된 조합이 없습니다.
            </p>
          </Card>
        ) : (
          <Card className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs whitespace-nowrap text-muted-foreground">
                    <th className="px-4 py-2.5 font-medium">조합명</th>
                    <th className="px-4 py-2.5 font-medium">결성일</th>
                    <th className="px-4 py-2.5 font-medium">만기일</th>
                    <th className="px-4 py-2.5 font-medium">목적구분</th>
                    <th className="px-4 py-2.5 font-medium">투자분야</th>
                    <th className="px-4 py-2.5 text-right font-medium">
                      결성약정총액
                    </th>
                    <th className="px-4 py-2.5 font-medium">
                      드라이파우더 (추정)
                    </th>
                    <th className="w-16 px-4 py-2.5">
                      <span className="sr-only">관리</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {sortedFunds.map((fund) => {
                    const recent =
                      typeof fund.vintage === "number" &&
                      fund.vintage >= HIGHLIGHT_FROM;
                    return (
                    <tr
                      key={fund.id}
                      className={cn(
                        "border-b border-border last:border-0 align-top hover:bg-muted/40",
                        recent &&
                          "bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/30 dark:hover:bg-emerald-950/40",
                      )}
                    >
                      <td className="px-4 py-3 font-medium">{fund.name}</td>
                      <td className="px-4 py-3 whitespace-nowrap text-muted-foreground tabular-nums">
                        {fund.formation_date
                          ? formatDate(fund.formation_date)
                          : fund.vintage
                            ? `${fund.vintage}년`
                            : "—"}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-muted-foreground tabular-nums">
                        {fund.maturity_date
                          ? formatDate(fund.maturity_date)
                          : "—"}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {fund.main_purpose ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {fund.sector_focus?.length
                          ? fund.sector_focus.join(", ")
                          : "—"}
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap tabular-nums">
                        {fund.aum ? formatKRW(fund.aum) : "—"}
                      </td>
                      <td className="px-4 py-3">
                        <FundDryPowderCell fund={fund} />
                      </td>
                      <td className="px-2 py-3">
                        <div className="flex justify-end gap-1">
                          <FundFormDialog
                            investorId={investor.id}
                            fund={fund}
                            trigger={
                              <Button
                                variant="ghost"
                                size="icon-xs"
                                aria-label="조합 수정"
                              >
                                <Pencil />
                              </Button>
                            }
                          />
                          <DeleteDialog
                            trigger={
                              <Button
                                variant="ghost"
                                size="icon-xs"
                                aria-label="조합 삭제"
                              >
                                <Trash2 />
                              </Button>
                            }
                            title="조합을 삭제할까요?"
                            description={`'${fund.name}' 조합을 삭제합니다.`}
                            action={deleteFund.bind(null, fund.id, investor.id)}
                          />
                        </div>
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </section>

      {/* 컨택 */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold tracking-tight">
            컨택{" "}
            <span className="text-sm font-normal text-muted-foreground">
              ({contacts.length})
            </span>
          </h2>
          <ContactFormDialog
            investorId={investor.id}
            trigger={
              <Button size="sm">
                <Plus />
                컨택
              </Button>
            }
          />
        </div>

        {contacts.length === 0 ? (
          <Card className="items-center justify-center py-12 text-center">
            <p className="text-sm text-muted-foreground">
              등록된 컨택이 없습니다.
            </p>
          </Card>
        ) : (
          <Card className="p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="px-4 py-2.5 font-medium">이름</th>
                  <th className="px-4 py-2.5 font-medium">직책</th>
                  <th className="px-4 py-2.5 font-medium">연락처</th>
                  <th className="px-4 py-2.5 font-medium">최근 컨택</th>
                  <th className="px-4 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {contacts.map((contact) => (
                  <tr
                    key={contact.id}
                    className="border-b border-border last:border-0 hover:bg-muted/40"
                  >
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1.5 font-medium">
                        {contact.is_decision_maker && (
                          <Star
                            className="size-3.5 fill-primary text-primary"
                            aria-label="의사결정권자"
                          />
                        )}
                        {contact.name}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {contact.title ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {contact.email ?? contact.phone ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {formatDate(contact.last_contacted_at)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1">
                        <ContactFormDialog
                          investorId={investor.id}
                          contact={contact}
                          trigger={
                            <Button
                              variant="ghost"
                              size="icon-xs"
                              aria-label="컨택 수정"
                            >
                              <Pencil />
                            </Button>
                          }
                        />
                        <DeleteDialog
                          trigger={
                            <Button
                              variant="ghost"
                              size="icon-xs"
                              aria-label="컨택 삭제"
                            >
                              <Trash2 />
                            </Button>
                          }
                          title="컨택을 삭제할까요?"
                          description={`'${contact.name}' 컨택을 삭제합니다.`}
                          action={deleteContact.bind(
                            null,
                            contact.id,
                            investor.id,
                          )}
                        />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
      </section>

      {/* 연결된 딜 */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold tracking-tight">
            연결된 딜{" "}
            <span className="text-sm font-normal text-muted-foreground">
              (매물 × 이 투자사)
            </span>
          </h2>
          <DealFormDialog
            {...dealDialogProps}
            trigger={
              <Button size="sm">
                <Plus />딜
              </Button>
            }
          />
        </div>

        {deals.length === 0 ? (
          <Card className="items-center justify-center py-12 text-center">
            <p className="text-sm text-muted-foreground">
              연결된 딜이 없습니다. 매물을 골라 첫 딜을 만들어 보세요.
            </p>
          </Card>
        ) : (
          <Card className="p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="px-4 py-2.5 font-medium">매물</th>
                  <th className="px-4 py-2.5 font-medium">단계</th>
                  <th className="px-4 py-2.5 font-medium">담당</th>
                  <th className="px-4 py-2.5 font-medium">예상금액</th>
                  <th className="px-4 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {deals.map((deal) => (
                  <tr
                    key={deal.id}
                    className="border-b border-border last:border-0 hover:bg-muted/40"
                  >
                    <td className="px-4 py-3">
                      <Link
                        href={`/listings/${deal.listing_id}`}
                        className="font-medium text-foreground hover:text-primary hover:underline"
                      >
                        {deal.listing?.company_name ?? "—"}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={DEAL_STAGE_VARIANT[deal.stage]}>
                        {deal.stage}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {deal.owner?.name ?? deal.owner?.email ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {formatKRW(deal.expected_amount)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1">
                        <DealFormDialog
                          {...dealDialogProps}
                          deal={deal}
                          trigger={
                            <Button
                              variant="ghost"
                              size="icon-xs"
                              aria-label="딜 수정"
                            >
                              <Pencil />
                            </Button>
                          }
                        />
                        <DeleteDialog
                          trigger={
                            <Button
                              variant="ghost"
                              size="icon-xs"
                              aria-label="딜 삭제"
                            >
                              <Trash2 />
                            </Button>
                          }
                          title="딜을 삭제할까요?"
                          description={`'${deal.listing?.company_name ?? ""}' 딜을 삭제합니다.`}
                          action={deleteDeal.bind(null, deal.id, undefined)}
                        />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
      </section>

      {/* 활동 */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold tracking-tight">
            활동 타임라인{" "}
            <span className="text-sm font-normal text-muted-foreground">
              ({activities.length})
            </span>
          </h2>
          <ActivityFormDialog
            investorId={investor.id}
            contacts={activityContacts}
            deals={activityDeals}
            trigger={
              <Button size="sm">
                <Plus />
                활동 기록
              </Button>
            }
          />
        </div>
        <ActivityTimeline activities={activities} investorId={investor.id} />
      </section>
    </div>
  );
}
