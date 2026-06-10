import Link from "next/link";
import { notFound } from "next/navigation";
import { Pencil, Plus, Star, Trash2 } from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/supabase/auth";
import {
  DEAL_STAGE_VARIANT,
  SECONDARY_APPETITE_VARIANT,
  type ActivityCard,
  type Contact,
  type DealCard,
  type Fund,
  type InvestorWithOwner,
  type UserRow,
} from "@/lib/types";
import { formatDate, formatKRW } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { InvestorFormDialog } from "../_components/investor-form-dialog";
import { FundFormDialog } from "../_components/fund-form-dialog";
import { ContactFormDialog } from "../_components/contact-form-dialog";
import { DeleteDialog } from "@/components/app/delete-dialog";
import { DealFormDialog } from "../../deals/_components/deal-form-dialog";
import { deleteDeal } from "../../deals/actions";
import { ActivityFormDialog } from "../../activities/_components/activity-form-dialog";
import { ActivityTimeline } from "../../activities/_components/activity-timeline";
import {
  deleteContact,
  deleteFund,
  deleteInvestor,
} from "../actions";

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
    supabase
      .from("investors")
      .select("*, owner:users(name, email)")
      .eq("id", id)
      .single(),
    supabase.from("funds").select("*").eq("investor_id", id).order("created_at"),
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

  // 소개 경로(F8): intro 정보가 하나라도 있는 딜
  const introDeals = deals.filter(
    (d) => d.intro_source || d.intro_relationship || d.intro_date,
  );

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6">
      <Link
        href="/investors"
        className="text-sm text-muted-foreground hover:text-foreground"
      >
        ← 투자사 목록
      </Link>

      {/* 헤더 */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">
              {investor.name}
            </h1>
            {investor.type && <Badge variant="outline">{investor.type}</Badge>}
          </div>
          <p className="text-sm text-muted-foreground">
            담당 {investor.owner?.name ?? investor.owner?.email ?? "—"}
          </p>
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

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">개요</TabsTrigger>
          <TabsTrigger value="funds">조합 ({funds.length})</TabsTrigger>
          <TabsTrigger value="contacts">컨택 ({contacts.length})</TabsTrigger>
          <TabsTrigger value="deals">딜 ({deals.length})</TabsTrigger>
          <TabsTrigger value="intro">소개경로</TabsTrigger>
          <TabsTrigger value="activity">활동 ({activities.length})</TabsTrigger>
        </TabsList>

        {/* 개요 */}
        <TabsContent value="overview">
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
                  <dt className="text-xs">등록일</dt>
                  <dd className="text-foreground">
                    {formatDate(investor.created_at)}
                  </dd>
                </div>
              </dl>
            </CardContent>
          </Card>
        </TabsContent>

        {/* 조합 */}
        <TabsContent value="funds">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-medium text-muted-foreground">
                운용 조합 (Funds)
              </h2>
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

            {funds.length === 0 ? (
              <Card className="items-center justify-center py-12 text-center">
                <p className="text-sm text-muted-foreground">
                  등록된 조합이 없습니다.
                </p>
              </Card>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                {funds.map((fund) => (
                  <Card key={fund.id} size="sm">
                    <CardHeader>
                      <div className="flex items-start justify-between gap-2">
                        <CardTitle className="text-sm">{fund.name}</CardTitle>
                        <div className="flex items-center gap-1">
                          {fund.secondary_appetite && (
                            <Badge
                              variant={
                                SECONDARY_APPETITE_VARIANT[
                                  fund.secondary_appetite
                                ]
                              }
                            >
                              구주 {fund.secondary_appetite}
                            </Badge>
                          )}
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
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3 text-sm">
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <p className="text-xs text-muted-foreground">
                            드라이파우더
                          </p>
                          <p className="font-medium">
                            {formatKRW(fund.dry_powder)}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">만기일</p>
                          <p className="font-medium">
                            {formatDate(fund.maturity_date)}
                          </p>
                        </div>
                      </div>
                      {fund.main_purpose && (
                        <div>
                          <p className="text-xs text-muted-foreground">주목적</p>
                          <p>{fund.main_purpose}</p>
                        </div>
                      )}
                      {(fund.stage_focus?.length || fund.sector_focus?.length) ? (
                        <div className="flex flex-wrap gap-1">
                          {fund.stage_focus?.map((s) => (
                            <Badge key={`st-${s}`} variant="outline">
                              {s}
                            </Badge>
                          ))}
                          {fund.sector_focus?.map((s) => (
                            <Badge key={`se-${s}`} variant="secondary">
                              {s}
                            </Badge>
                          ))}
                        </div>
                      ) : null}
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </TabsContent>

        {/* 컨택 */}
        <TabsContent value="contacts">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-medium text-muted-foreground">
                네트워크 (Contacts)
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
          </div>
        </TabsContent>

        {/* 딜 — 이 투자사에 연결된 딜(매물 × 투자사) */}
        <TabsContent value="deals">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-medium text-muted-foreground">
                연결된 딜 (매물 × 이 투자사)
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
          </div>
        </TabsContent>

        {/* 소개경로 — 이 투자사로의 진입 경로(F8) */}
        <TabsContent value="intro">
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              이 투자사로 어떻게 연결됐는지(소개자·관계·일자)를 딜별로 모아
              봅니다.
            </p>
            {introDeals.length === 0 ? (
              <Card className="items-center justify-center py-12 text-center">
                <p className="text-sm text-muted-foreground">
                  기록된 소개 경로가 없습니다. 딜 생성·수정 시 “소개 경로”를
                  입력하세요.
                </p>
              </Card>
            ) : (
              <Card className="p-0">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-xs text-muted-foreground">
                      <th className="px-4 py-2.5 font-medium">매물</th>
                      <th className="px-4 py-2.5 font-medium">소개자</th>
                      <th className="px-4 py-2.5 font-medium">관계</th>
                      <th className="px-4 py-2.5 font-medium">일자</th>
                    </tr>
                  </thead>
                  <tbody>
                    {introDeals.map((deal) => (
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
                          {deal.intro_source ?? "—"}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {deal.intro_relationship ?? "—"}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {formatDate(deal.intro_date)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>
            )}
          </div>
        </TabsContent>

        {/* 활동 — 컨택 이력 타임라인(F5) */}
        <TabsContent value="activity">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-medium text-muted-foreground">
                활동 타임라인
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
            <ActivityTimeline
              activities={activities}
              investorId={investor.id}
            />
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
