"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { Plus, Star, X } from "lucide-react";

import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DEAL_STAGES,
  INVESTOR_TYPES,
  type Deal,
  type UserRow,
} from "@/lib/types";
import { cn } from "@/lib/utils";
import { Field } from "@/components/app/field";
import { InvestorPicker, todayLocal } from "@/components/app/investor-picker";
import { StageHistoryEditor } from "./stage-history-editor";
import {
  createDeal,
  deleteListingBundle,
  getInvestorEditData,
  saveListingBundle,
  updateDeal,
  type ActionResult,
  type InvestorEditData,
  type ListingBundle,
} from "../actions";

export type DealOptionListing = { id: string; company_name: string };
export type DealOptionInvestor = { id: string; name: string };
export type DealOptionFund = { id: string; name: string; investor_id: string };

const FUND_ALL = "all";

/**
 * 매물 복수 선택(생성 시) — 운용펀드로 먼저 구분 + 검색 + 체크박스 목록.
 * 선택값은 hidden input(name="listing_ids")으로 폼에 실려 서버 액션이
 * 매물마다 딜을 생성한다.
 */
function ListingMultiSelect({
  listings,
  value,
  onChange,
  holdingFunds = [],
  listingFundMap = {},
  initialFund = FUND_ALL,
  bundles: initialBundles = [],
}: {
  listings: DealOptionListing[];
  value: string[];
  onChange: (next: string[]) => void;
  holdingFunds?: { id: string; name: string }[];
  listingFundMap?: Record<string, string[]>;
  /** 보드에서 넘어온 펀드 필터 — 다이얼로그 열릴 때 운용펀드 구분 기본값. */
  initialFund?: string;
  /** 매물 즐겨찾기 묶음(팀 공유). 서버에서 로드한 초기값. */
  bundles?: ListingBundle[];
}) {
  const [q, setQ] = useState("");
  const [fund, setFund] = useState(initialFund);
  const query = q.trim().toLowerCase();
  const filtered = listings.filter((l) => {
    const byFund =
      fund === FUND_ALL || (listingFundMap[l.id] ?? []).includes(fund);
    const byText = !query || l.company_name.toLowerCase().includes(query);
    return byFund && byText;
  });

  // 즐겨찾기 묶음(저장/적용/삭제). 초기값은 props, 이후 낙관적으로 로컬 관리.
  const [bundles, setBundles] = useState<ListingBundle[]>(initialBundles);
  const [bundleName, setBundleName] = useState("");
  const [bundleMsg, setBundleMsg] = useState<string | null>(null);
  const [bundleSaving, startBundleSave] = useTransition();
  const listingIdSet = new Set(listings.map((l) => l.id));

  function toggle(id: string) {
    onChange(
      value.includes(id) ? value.filter((v) => v !== id) : [...value, id],
    );
  }

  // 묶음 적용 — 현재 선택에 묶음의 매물을 더한다(이미 삭제된 매물 id는 무시).
  function applyBundle(b: ListingBundle) {
    const avail = b.listing_ids.filter((id) => listingIdSet.has(id));
    onChange([...new Set([...value, ...avail])]);
  }

  function handleSaveBundle() {
    const name = bundleName.trim();
    if (!name || value.length === 0) return;
    setBundleMsg(null);
    startBundleSave(async () => {
      const res = await saveListingBundle(name, value);
      if (!res.ok) {
        setBundleMsg(res.error);
        return;
      }
      // 같은 이름이면 교체, 아니면 추가
      setBundles((prev) => [
        ...prev.filter((b) => b.id !== res.bundle.id && b.name !== res.bundle.name),
        res.bundle,
      ]);
      setBundleName("");
      setBundleMsg(`‘${name}’ 묶음을 저장했습니다.`);
    });
  }

  function handleDeleteBundle(id: string) {
    setBundles((prev) => prev.filter((b) => b.id !== id)); // 낙관적 제거
    startBundleSave(async () => {
      await deleteListingBundle(id);
    });
  }

  return (
    <div className="space-y-2">
      {value.map((id) => (
        <input key={id} type="hidden" name="listing_ids" value={id} />
      ))}

      {/* 즐겨찾기 묶음 — 자주 함께 내보내는 매물 조합을 저장/적용 */}
      <div className="space-y-2 rounded-lg border border-dashed border-border p-2.5">
        <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <Star className="size-3.5" />
          즐겨찾기 묶음
        </div>
        {bundles.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {bundles.map((b) => {
              const availCount = b.listing_ids.filter((id) =>
                listingIdSet.has(id),
              ).length;
              return (
                <span
                  key={b.id}
                  className="inline-flex items-center gap-1 rounded-full border border-border bg-card py-0.5 pl-2.5 pr-1 text-xs"
                >
                  <button
                    type="button"
                    className="font-medium hover:text-primary"
                    onClick={() => applyBundle(b)}
                    title="이 묶음의 매물을 선택에 추가"
                  >
                    {b.name}
                    <span className="ml-1 text-muted-foreground">
                      {availCount}
                    </span>
                  </button>
                  <button
                    type="button"
                    aria-label={`${b.name} 묶음 삭제`}
                    className="rounded-full p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                    onClick={() => handleDeleteBundle(b.id)}
                  >
                    <X className="size-3" />
                  </button>
                </span>
              );
            })}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            저장된 묶음이 없습니다. 매물을 고른 뒤 아래에서 저장하세요.
          </p>
        )}
        {value.length > 0 && (
          <div className="flex items-center gap-1">
            <Input
              value={bundleName}
              onChange={(e) => setBundleName(e.target.value)}
              placeholder={`현재 선택 ${value.length}개를 묶음 이름으로 저장`}
              className="h-7 text-xs"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleSaveBundle();
                }
              }}
            />
            <Button
              type="button"
              size="xs"
              variant="outline"
              disabled={!bundleName.trim() || bundleSaving}
              onClick={handleSaveBundle}
            >
              저장
            </Button>
          </div>
        )}
        {bundleMsg && (
          <p className="text-xs text-muted-foreground">{bundleMsg}</p>
        )}
      </div>
      {holdingFunds.length > 0 && (
        <Select value={fund} onValueChange={setFund}>
          <SelectTrigger aria-label="운용펀드로 구분">
            <SelectValue placeholder="운용펀드" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={FUND_ALL}>전체 운용펀드</SelectItem>
            {holdingFunds.map((f) => (
              <SelectItem key={f.id} value={f.id}>
                {f.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
      <Input
        placeholder="매물 검색…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      <div className="max-h-48 divide-y divide-border overflow-y-auto rounded-lg border border-input">
        {filtered.length === 0 ? (
          <p className="px-3 py-4 text-center text-sm text-muted-foreground">
            {listings.length === 0
              ? "등록된 매물이 없습니다."
              : "조건에 맞는 매물이 없습니다."}
          </p>
        ) : (
          filtered.map((l) => (
            <label
              key={l.id}
              className="flex cursor-pointer items-center gap-2 px-3 py-2 text-sm hover:bg-muted/40"
            >
              <Checkbox
                checked={value.includes(l.id)}
                onCheckedChange={() => toggle(l.id)}
              />
              {l.company_name}
            </label>
          ))
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        {value.length}개 매물 선택됨{value.length > 1 ? " — 각각 딜이 생성됩니다." : ""}
      </p>
    </div>
  );
}

/**
 * 딜 수정 폼에서 연결된 투자사 정보를 함께 편집하는 섹션.
 * 새 딜 생성의 InvestorPicker(새 투자사 등록)와 동일한 항목을 기존값으로
 * 채워 편집한다. 제출 필드명도 동일 계열을 쓰되, 조합 행의 식별자는 딜의
 * "대상 조합"(name="fund_id")과 충돌하지 않도록 name="fund_row_id"를 사용한다.
 *
 * 제출 필드: investor_name·investor_type·investor_met_date·
 *   investor_description·contact_id·contact_name·contact_title·
 *   fund_row_id[]·fund_name[]·fund_main_purpose[]·fund_notes[]
 */
function InvestorEditSection({ data }: { data: InvestorEditData }) {
  type FundRow = {
    key: number;
    id: string;
    name: string;
    main_purpose: string | null;
    notes: string | null;
  };

  const [fundRows, setFundRows] = useState<FundRow[]>(() =>
    data.funds.length > 0
      ? data.funds.map((f, i) => ({ key: i, ...f }))
      : [{ key: 0, id: "", name: "", main_purpose: null, notes: null }],
  );

  // 유형: 제어형 Select + hidden input. (Radix Select 의 숨은 폼 컨트롤은
  // 드롭다운이 닫히면 값이 유실될 수 있어, 명시적 hidden input 으로 제출한다.)
  const [investorType, setInvestorType] = useState(data.investor.type ?? "");

  function addFundRow() {
    setFundRows((rows) => [
      ...rows,
      {
        key: (rows[rows.length - 1]?.key ?? 0) + 1,
        id: "",
        name: "",
        main_purpose: null,
        notes: null,
      },
    ]);
  }
  function removeFundRow(key: number) {
    setFundRows((rows) => rows.filter((r) => r.key !== key));
  }

  return (
    <div className="space-y-4">
      <Field label="투자사" required>
        <Input
          name="investor_name"
          defaultValue={data.investor.name}
          placeholder="투자사명"
          required
        />
      </Field>

      <div className="space-y-4 rounded-lg border border-border p-3">
        <div className="grid grid-cols-2 gap-4">
          <Field label="유형">
            <input type="hidden" name="investor_type" value={investorType} />
            <Select
              value={investorType || undefined}
              onValueChange={setInvestorType}
            >
              <SelectTrigger>
                <SelectValue placeholder="선택 (선택사항)" />
              </SelectTrigger>
              <SelectContent>
                {INVESTOR_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field label="일자" htmlFor="investor_met_date">
            <Input
              id="investor_met_date"
              name="investor_met_date"
              type="date"
              defaultValue={data.investor.met_date ?? ""}
            />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Field label="컨택 심사역" htmlFor="contact_name">
            <Input
              id="contact_name"
              name="contact_name"
              placeholder="이름"
              defaultValue={data.contact?.name ?? ""}
            />
          </Field>
          <Field label="직책" htmlFor="contact_title">
            <Input
              id="contact_title"
              name="contact_title"
              placeholder="상무 / 심사역 등"
              defaultValue={data.contact?.title ?? ""}
            />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Field label="이메일" htmlFor="contact_email">
            <Input
              id="contact_email"
              name="contact_email"
              type="email"
              placeholder="name@example.com"
              defaultValue={data.contact?.email ?? ""}
            />
          </Field>
          <Field label="휴대폰" htmlFor="contact_phone">
            <Input
              id="contact_phone"
              name="contact_phone"
              placeholder="010-0000-0000"
              defaultValue={data.contact?.phone ?? ""}
            />
          </Field>
        </div>
        {data.contact && (
          <input type="hidden" name="contact_id" value={data.contact.id} />
        )}

        <Field label="개요·성향 메모" htmlFor="investor_description">
          <Textarea
            id="investor_description"
            name="investor_description"
            defaultValue={data.investor.description ?? ""}
          />
        </Field>

        <div className="space-y-3 rounded-md bg-muted/40 p-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">조합</p>
            <Button type="button" variant="outline" size="xs" onClick={addFundRow}>
              <Plus />
              조합 추가
            </Button>
          </div>
          {fundRows.map((row, idx) => (
            <div
              key={row.key}
              className="space-y-2 rounded-md border border-border bg-background p-2.5"
            >
              <input type="hidden" name="fund_row_id" value={row.id} />
              <div className="flex items-center gap-2">
                <Input
                  name="fund_name"
                  defaultValue={row.name}
                  placeholder={`조합명${idx === 0 ? "" : ` ${idx + 1}`}`}
                  aria-label="조합명"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label="조합 행 삭제"
                  onClick={() => removeFundRow(row.key)}
                >
                  <X />
                </Button>
              </div>
              <Input
                name="fund_main_purpose"
                defaultValue={row.main_purpose ?? ""}
                placeholder="주목적"
              />
              <Input
                name="fund_notes"
                defaultValue={row.notes ?? ""}
                placeholder="비고"
              />
            </div>
          ))}
          {fundRows.length === 0 && (
            <p className="text-xs text-muted-foreground">
              등록된 조합이 없습니다. &lsquo;조합 추가&rsquo;로 등록하세요.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

export function DealFormDialog({
  trigger,
  deal,
  listings,
  investors,
  lockListingId,
  lockInvestorId,
  holdingFunds,
  listingFundMap,
  initialFundFilter,
  listingBundles,
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange,
}: {
  /** 트리거 버튼. 외부에서 open/onOpenChange 로 직접 제어할 때는 생략 가능. */
  trigger?: React.ReactNode;
  deal?: Deal;
  listings: DealOptionListing[];
  investors: DealOptionInvestor[];
  funds: DealOptionFund[];
  users: UserRow[];
  currentUserId: string;
  lockListingId?: string;
  lockInvestorId?: string;
  /** 운용펀드 목록 + 매물→운용펀드 매핑(생성 시 매물 복수선택 그룹핑용, 선택). */
  holdingFunds?: { id: string; name: string }[];
  listingFundMap?: Record<string, string[]>;
  /** 보드의 활성 펀드 필터 — 생성 시 매물 복수선택의 운용펀드 구분 기본값으로 사용. */
  initialFundFilter?: string;
  /** 매물 즐겨찾기 묶음(팀 공유, 서버 로드) — 생성 시 매물 복수선택에서 적용/저장. */
  listingBundles?: ListingBundle[];
  /** 제어형(controlled) 사용: 부모가 열림 상태를 보유. (칸반 카드 클릭 등) */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const isEdit = Boolean(deal);
  const [state, formAction, pending] = useActionState<
    ActionResult | undefined,
    FormData
  >(isEdit ? updateDeal : createDeal, undefined);

  // 비제어(자체 trigger) / 제어(부모가 open 보유) 양쪽 지원
  const isControlled = controlledOpen !== undefined;
  const [internalOpen, setInternalOpen] = useState(false);
  const open = isControlled ? controlledOpen : internalOpen;
  const setOpen = (next: boolean) => {
    if (isControlled) controlledOnOpenChange?.(next);
    else setInternalOpen(next);
  };

  // 수정 모드의 투자사 = 딜의 투자사로 고정(투자사 편집 데이터 지연 로드 키).
  const fixedInvestorId = deal?.investor_id ?? lockInvestorId;

  // 단계: 제어형 Select + hidden input (Radix Select 의 숨은 폼 컨트롤이
  // 드롭다운을 닫으면 값을 유실할 수 있어 명시적 hidden input 으로 제출).
  const [stage, setStage] = useState<string>(deal?.stage ?? "컨택");

  // 생성 시 "단계 진입 일자"(=카드의 컨택일자) — 기본값은 새 투자사 '만난 일자'를
  // 따라간다. 사용자가 단계 일자를 직접 바꾸면(touched) 그 값으로 고정된다.
  // (effect 없이 파생값으로 동기화 — 불필요한 cascading render 방지)
  const [metDate, setMetDate] = useState(todayLocal());
  const [stageDate, setStageDate] = useState("");
  const [stageDateTouched, setStageDateTouched] = useState(false);
  const effectiveStageDate = stageDateTouched ? stageDate : metDate;

  // 수정 모드: 연결된 투자사의 편집 데이터(유형·일자·메모·컨택·조합)를
  // 다이얼로그를 열 때 지연 로드한다(칸반 카드엔 투자사 id·name 만 실려옴).
  const [investorData, setInvestorData] = useState<InvestorEditData | null>(null);
  const [investorLoading, setInvestorLoading] = useState(false);

  useEffect(() => {
    if (!open || !isEdit || !fixedInvestorId) return;
    let cancelled = false;
    setInvestorLoading(true);
    getInvestorEditData(fixedInvestorId).then((res) => {
      if (cancelled) return;
      if (res.ok) setInvestorData(res.data);
      setInvestorLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [open, isEdit, fixedInvestorId]);

  // 생성 시 매물 복수 선택(매물 잠금/수정 모드가 아닐 때만 사용)
  const multiListing = !isEdit && !lockListingId;
  const [selectedListingIds, setSelectedListingIds] = useState<string[]>([]);

  // 생성 시 투자사: 기존 선택 ↔ 새 투자사 등록 토글(투자사 잠금/수정이 아닐 때만)
  const investorSelectable = !isEdit && !lockInvestorId;

  useEffect(() => {
    if (!state?.ok) return;
    // 건너뛴 매물(중복)이 있으면 요약을 보여주기 위해 다이얼로그를 닫지 않는다.
    if ((state.skipped ?? 0) > 0) {
      setSelectedListingIds([]);
    } else {
      setOpen(false);
    }
  }, [state]);

  // 닫힐 때 입력 상태 초기화(다음 생성/수정에 잔존 방지)
  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) {
      setSelectedListingIds([]);
      setInvestorData(null);
      setMetDate(todayLocal());
      setStageDate("");
      setStageDateTouched(false);
    }
  }

  const lockedListing = listings.find((l) => l.id === (deal?.listing_id ?? lockListingId));
  const lockedInvestor = investors.find((i) => i.id === fixedInvestorId);

  // 매물 필드: 수정/잠금이면 단일 고정, 생성이면 복수 선택
  const listingField = multiListing ? (
    <Field
      label="매물"
      required
      hint="한 투자사에 여러 매물을 한꺼번에 소개할 수 있습니다."
    >
      <ListingMultiSelect
        listings={listings}
        value={selectedListingIds}
        onChange={setSelectedListingIds}
        holdingFunds={holdingFunds}
        listingFundMap={listingFundMap}
        initialFund={initialFundFilter}
        bundles={listingBundles}
      />
    </Field>
  ) : (
    <Field label="매물" required>
      <input
        type="hidden"
        name="listing_ids"
        value={deal?.listing_id ?? lockListingId}
      />
      <div className="flex h-9 items-center rounded-lg border border-input bg-muted/40 px-3 text-sm">
        {lockedListing?.company_name ?? "—"}
      </div>
    </Field>
  );

  // 투자사 필드:
  //  - 수정: 연결된 투자사 정보를 직접 편집(지연 로드한 데이터로 프리필)
  //  - 잠금(매물/투자사 상세에서 생성): 고정 표시
  //  - 생성: 기존 투자사 선택 ↔ 새 투자사 등록 토글(InvestorPicker 공용)
  const investorField = isEdit ? (
    investorData ? (
      <InvestorEditSection data={investorData} />
    ) : (
      <Field label="투자사" required>
        <div className="flex h-9 items-center rounded-lg border border-input bg-muted/40 px-3 text-sm text-muted-foreground">
          {investorLoading
            ? "투자사 정보를 불러오는 중…"
            : (lockedInvestor?.name ?? deal?.investor_id ?? "—")}
        </div>
      </Field>
    )
  ) : !investorSelectable ? (
    <Field label="투자사" required>
      <input type="hidden" name="investor_id" value={fixedInvestorId} />
      <div className="flex h-9 items-center rounded-lg border border-input bg-muted/40 px-3 text-sm">
        {lockedInvestor?.name ?? "—"}
      </div>
    </Field>
  ) : (
    <InvestorPicker
      investors={investors}
      metDate={metDate}
      onMetDateChange={setMetDate}
    />
  );

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? "딜 수정" : "새 딜 생성"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "딜 단계와 함께 연결된 투자사 정보(유형·일자·컨택·조합)를 수정합니다."
              : "투자사(신규 등록 또는 기존 선택)와 소개할 매물을 골라 딜을 만듭니다. 매물을 여러 개 선택하면 매물마다 딜이 생성됩니다."}
          </DialogDescription>
        </DialogHeader>

        <form action={formAction} className="space-y-4">
          {isEdit && <input type="hidden" name="id" value={deal!.id} />}

          {/* 매물 · 투자사 (딜 정체성) — 생성 시 매물 복수 선택 + 투자사 등록/선택,
              수정·잠금 시 고정 표시. 세로로 쌓아 배치한다. */}
          <div className="space-y-4">
            {listingField}
            {investorField}
          </div>

          {/* 단계(+ 생성 시 진입 일자) — 생성·수정 공통.
              진입 일자 = 카드에 찍히는 그 단계 진입일(예: 컨택일자). 과거 딜을
              입력할 때 오늘이 아닌 실제 일자로 지정할 수 있다. */}
          <div className={cn("grid gap-4", !isEdit && "grid-cols-2")}>
            <Field label="단계" required>
              <input type="hidden" name="stage" value={stage} />
              <Select value={stage} onValueChange={setStage}>
                <SelectTrigger>
                  <SelectValue placeholder="선택" />
                </SelectTrigger>
                <SelectContent>
                  {DEAL_STAGES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            {!isEdit && (
              <Field
                label="단계 진입 일자"
                htmlFor="stage_date"
                hint="카드에 표시되는 진입일(기본: 투자사 만난 일자)"
              >
                <Input
                  id="stage_date"
                  name="stage_date"
                  type="date"
                  value={effectiveStageDate}
                  onChange={(e) => {
                    setStageDateTouched(true);
                    setStageDate(e.target.value);
                  }}
                />
              </Field>
            )}
          </div>

          {!isEdit && (
            <p className="text-xs text-muted-foreground">
              담당 심사역은 딜 생성자(나)로 지정됩니다. 투자사 상세 정보는 생성 후
              딜 수정에서 입력할 수 있습니다.
            </p>
          )}

          {isEdit && <StageHistoryEditor dealId={deal!.id} />}

          {isEdit && (
            <Field label="메모" htmlFor="lost_reason">
              <Textarea
                id="lost_reason"
                name="lost_reason"
                defaultValue={deal?.lost_reason ?? ""}
              />
            </Field>
          )}

          {state && !state.ok && (
            <p className="text-sm text-destructive" role="alert">
              {state.error}
            </p>
          )}
          {state?.ok && (state.skipped ?? 0) > 0 && (
            <p className="text-sm text-foreground" role="status">
              딜 {state.created ?? 0}개를 생성했습니다.{" "}
              {state.skipped}개 매물은 이미 이 투자사에 딜이 있어 건너뛰었습니다.
            </p>
          )}

          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                {state?.ok ? "닫기" : "취소"}
              </Button>
            </DialogClose>
            <Button
              type="submit"
              disabled={
                pending ||
                (multiListing && selectedListingIds.length === 0) ||
                (isEdit && investorLoading)
              }
            >
              {pending
                ? "저장 중…"
                : multiListing && selectedListingIds.length > 1
                  ? `딜 ${selectedListingIds.length}개 생성`
                  : "저장"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
