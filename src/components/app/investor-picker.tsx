"use client";

import { useRef, useState } from "react";
import { Lock, Plus, Search, X } from "lucide-react";

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
import { Field } from "@/components/app/field";
import { cn } from "@/lib/utils";
import { INVESTOR_TYPES } from "@/lib/types";
import {
  searchBusinessCards,
  type BusinessCardHit,
} from "@/app/(app)/import/contacts/actions";
import { searchInvestors } from "@/app/(app)/deals/actions";
import { type InvestorMatch } from "@/lib/investor-aliases";
import { normName } from "@/lib/normalize";

export type InvestorOption = { id: string; name: string };

// 로컬 기준 오늘 날짜(YYYY-MM-DD). 날짜 입력 기본값용.
export function todayLocal(): string {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

/**
 * 투자사 입력 섹션 — 기존 투자사 선택 ↔ 새 투자사 등록 토글.
 * 딜 생성·미팅 기록 등 여러 폼에서 공유. 폼 필드명을 그대로 제출하므로
 * 서버 액션(createInvestorInline 류)이 동일하게 읽는다. 상태는 자체 보유하며,
 * 부모 다이얼로그가 닫힐 때 언마운트되어 자연히 초기화된다.
 *
 * 제출 필드: investor_mode, (existing) investor_id |
 *   (new) investor_name·investor_type·investor_met_date·investor_description·
 *   contact_name·contact_title·fund_name[]·fund_main_purpose[]·fund_notes[]
 */
export function InvestorPicker({
  investors,
  showMetDate = true,
  metDate,
  onMetDateChange,
}: {
  investors: InvestorOption[];
  /** 새 투자사 "일자(만난 일자)" 입력 노출 여부. 미팅 기록처럼 상위 폼이
   *  별도 일자를 갖는 경우 false 로 숨긴다. */
  showMetDate?: boolean;
  /** 만난 일자를 상위 폼이 제어할 때 사용(예: 딜 생성의 단계 진입 일자와 동기화).
   *  미지정 시 자체 기본값(오늘)을 쓰는 비제어 입력으로 동작한다. */
  metDate?: string;
  onMetDateChange?: (value: string) => void;
}) {
  const [mode, setMode] = useState<"new" | "existing">("new");
  const [investorId, setInvestorId] = useState("");
  const [investorType, setInvestorType] = useState("");
  const [fundKeys, setFundKeys] = useState<number[]>([0]);

  // 프리필 대상(명함 선택 시 채워짐). 비제어→제어 전환으로 일반 타이핑도 동작.
  const [investorName, setInvestorName] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactTitle, setContactTitle] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  // 명함에서 불러온 이메일/휴대폰은 기본 잠금(수기 수정 방지). '직접 입력'으로 해제.
  const [contactLocked, setContactLocked] = useState(false);

  // 명함 검색(백데이터 자동완성)
  const [cardQuery, setCardQuery] = useState("");
  const [cardResults, setCardResults] = useState<BusinessCardHit[]>([]);
  const [cardSearching, setCardSearching] = useState(false);
  // 디바운스 타이머 + 검색 시퀀스(경쟁요청 방지: 느린 이전 응답이 최신을 덮어쓰지 않게)
  const cardTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cardSeqRef = useRef(0);

  // 기존 투자사 후보(정규명·별칭 매칭) — 신규 입력 시 라벨 분산을 막기 위한 제안.
  const [invMatches, setInvMatches] = useState<InvestorMatch[]>([]);
  const invTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const invSeqRef = useRef(0);
  // 변형 표기로 기존 투자사를 고른 경우, 그 표기를 별칭으로 서버에 기록하기 위한 후보.
  const [aliasCandidate, setAliasCandidate] = useState("");

  // 투자사명 입력 → 정규화 일치 후보를 디바운스 검색(2글자+). 기존 레코드에 연결하도록 제안.
  function handleInvestorName(v: string) {
    setInvestorName(v);
    if (invTimerRef.current) clearTimeout(invTimerRef.current);
    if (normName(v).length < 2) {
      invSeqRef.current++;
      setInvMatches([]);
      return;
    }
    invTimerRef.current = setTimeout(async () => {
      const seq = ++invSeqRef.current;
      const hits = await searchInvestors(v);
      if (seq !== invSeqRef.current) return;
      setInvMatches(hits);
    }, 250);
  }

  // 후보 클릭 → 기존 투자사 연결로 전환. 입력했던 표기는 별칭 기록용으로 보관.
  function handlePickInvestor(m: InvestorMatch) {
    setAliasCandidate(investorName);
    setMode("existing");
    setInvestorId(m.id);
    setInvMatches([]);
    if (invTimerRef.current) clearTimeout(invTimerRef.current);
    invSeqRef.current++;
  }

  function addFundRow() {
    setFundKeys((keys) => [...keys, (keys[keys.length - 1] ?? 0) + 1]);
  }
  function removeFundRow(key: number) {
    setFundKeys((keys) => keys.filter((k) => k !== key));
  }

  // 명함 검색 — 디바운스(250ms)로 키 입력마다 검색 발사하지 않고, 최소 2글자부터
  // 검색한다(1글자는 명함 수천 건을 매번 훑어 느리고 결과도 과다). 시퀀스 비교로
  // 입력이 더 들어온 뒤 도착한 이전 응답은 버린다.
  function handleCardQuery(v: string) {
    setCardQuery(v);
    if (cardTimerRef.current) clearTimeout(cardTimerRef.current);

    const q = v.trim();
    if (q.length < 2) {
      cardSeqRef.current++; // 진행 중 검색 무효화
      setCardResults([]);
      setCardSearching(false);
      return;
    }

    setCardSearching(true);
    cardTimerRef.current = setTimeout(async () => {
      const seq = ++cardSeqRef.current;
      const hits = await searchBusinessCards(q);
      if (seq !== cardSeqRef.current) return; // 더 최신 입력이 있었음 → 폐기
      setCardResults(hits);
      setCardSearching(false);
    }, 250);
  }

  // 명함 선택 → 폼 자동 채움. 소속이 이미 등록된 투자사면 그 투자사를 선택,
  // 아니면 새 투자사 등록 모드로 회사·사람·직위를 프리필한다.
  function handlePickCard(card: BusinessCardHit) {
    const company = (card.company ?? "").trim();
    // 소속을 정규화 기준으로 기존 투자사와 대조(법인격·공백 차이 흡수).
    const matched = company
      ? investors.find((i) => normName(i.name) === normName(company))
      : undefined;

    if (matched) {
      setMode("existing");
      setInvestorId(matched.id);
      // 명함 소속 표기가 정규명과 다르면 별칭으로 기록되게 보관.
      setAliasCandidate(company);
      setInvMatches([]);
    } else {
      setMode("new");
      setInvestorName(company);
      setContactName(card.name);
      setContactTitle(card.title ?? "");
      setContactEmail(card.email ?? "");
      setContactPhone(card.phone ?? "");
      setContactLocked(true); // 명함 출처 연락처 잠금
      if (showMetDate && card.met_date) onMetDateChange?.(card.met_date);
      // 정확 일치는 없지만 유사 후보가 있을 수 있으니 제안 검색을 띄운다.
      handleInvestorName(company);
    }
    // 선택 후 진행 중인 디바운스 검색이 결과를 다시 채우지 않도록 취소
    if (cardTimerRef.current) clearTimeout(cardTimerRef.current);
    cardSeqRef.current++;
    setCardQuery("");
    setCardResults([]);
    setCardSearching(false);
  }

  return (
    <div className="space-y-3">
      <input type="hidden" name="investor_mode" value={mode} />
      <input
        type="hidden"
        name="investor_alias_candidate"
        value={aliasCandidate}
      />

      {/* 명함 검색 — 백데이터에서 이름으로 찾아 투자사·컨택을 자동 채움 */}
      <div className="space-y-1.5">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={cardQuery}
            onChange={(e) => handleCardQuery(e.target.value)}
            placeholder="명함으로 채우기 — 이름/소속 검색"
            className="pl-8"
            aria-label="명함 검색"
          />
        </div>
        {cardResults.length > 0 && (
          <div className="max-h-56 divide-y divide-border overflow-y-auto rounded-lg border border-input">
            {cardResults.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => handlePickCard(c)}
                className="flex w-full items-center gap-1.5 px-3 py-2 text-left text-sm hover:bg-muted/40"
              >
                <span className="font-medium text-foreground">{c.name}</span>
                {c.company && (
                  <span className="text-muted-foreground">· {c.company}</span>
                )}
                {c.title && (
                  <span className="truncate text-muted-foreground">
                    · {c.title}
                  </span>
                )}
              </button>
            ))}
          </div>
        )}
        {cardSearching && cardResults.length === 0 && (
          <p className="text-xs text-muted-foreground">검색 중…</p>
        )}
        {!cardSearching &&
          cardQuery.trim().length >= 2 &&
          cardResults.length === 0 && (
            <p className="text-xs text-muted-foreground">
              일치하는 명함이 없습니다. 아래에서 직접 입력하세요.
            </p>
          )}
      </div>

      <Field label="투자사" required>
        {/* 모드 토글 */}
        <div className="mb-2 inline-flex rounded-lg border border-input p-0.5 text-sm">
          {(
            [
              ["new", "새 투자사 등록"],
              ["existing", "기존 투자사 선택"],
            ] as const
          ).map(([m, label]) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={cn(
                "rounded-md px-3 py-1 transition-colors",
                mode === m
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {label}
            </button>
          ))}
        </div>

        {mode === "existing" ? (
          <Select
            name="investor_id"
            required
            value={investorId || undefined}
            onValueChange={(v) => {
              setInvestorId(v);
              setAliasCandidate(""); // 수동으로 다른 투자사를 고르면 별칭 후보 무효화
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="투자사 선택" />
            </SelectTrigger>
            <SelectContent>
              {investors.length === 0 ? (
                <div className="px-2 py-1.5 text-sm text-muted-foreground">
                  등록된 투자사가 없습니다.
                </div>
              ) : (
                investors.map((i) => (
                  <SelectItem key={i.id} value={i.id}>
                    {i.name}
                  </SelectItem>
                ))
              )}
            </SelectContent>
          </Select>
        ) : (
          <div className="space-y-1.5">
            <Input
              name="investor_name"
              placeholder="투자사명"
              required
              value={investorName}
              onChange={(e) => handleInvestorName(e.target.value)}
            />
            {invMatches.length > 0 && (
              <div className="rounded-lg border border-input bg-muted/30 p-1.5">
                <p className="px-1 pb-1 text-[11px] text-muted-foreground">
                  이미 등록된 투자사일 수 있어요 — 골라서 연결하면 한 라벨로 모입니다.
                </p>
                <div className="flex flex-wrap gap-1">
                  {invMatches.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => handlePickInvestor(m)}
                      className="rounded-full border border-border bg-card px-2.5 py-0.5 text-xs hover:border-primary hover:text-primary"
                      title={m.via ? `별칭 ‘${m.via}’ 일치` : undefined}
                    >
                      {m.name}
                      {m.via && (
                        <span className="ml-1 text-muted-foreground">
                          ({m.via})
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </Field>

      {/* 투자사 상세 — 신규 등록 시 입력, 기존 선택 시 컨택·조합 추가(+빈 값 보강) */}
      <div className="space-y-4 rounded-lg border border-border p-3">
        {mode === "existing" && (
          <p className="text-xs text-muted-foreground">
            컨택 심사역·조합은 이 투자사에 새로 추가됩니다. 유형·일자·개요 메모는
            기존 값이 비어 있을 때만 채워집니다.
          </p>
        )}
          <div className="grid grid-cols-2 gap-4">
            <Field label="유형">
              <input type="hidden" name="investor_type" value={investorType} />
              <Select
                value={investorType || undefined}
                onValueChange={setInvestorType}
              >
                <SelectTrigger>
                  <SelectValue placeholder="선택" />
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

            {showMetDate && (
              <Field label="일자" htmlFor="investor_met_date">
                <Input
                  id="investor_met_date"
                  name="investor_met_date"
                  type="date"
                  {...(metDate !== undefined
                    ? {
                        value: metDate,
                        onChange: (e) => onMetDateChange?.(e.target.value),
                      }
                    : { defaultValue: todayLocal() })}
                />
              </Field>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Field label="컨택 심사역" htmlFor="contact_name">
              <Input
                id="contact_name"
                name="contact_name"
                placeholder="이름"
                value={contactName}
                onChange={(e) => setContactName(e.target.value)}
              />
            </Field>
            <Field label="직책" htmlFor="contact_title">
              <Input
                id="contact_title"
                name="contact_title"
                placeholder="상무 / 심사역 등"
                value={contactTitle}
                onChange={(e) => setContactTitle(e.target.value)}
              />
            </Field>
          </div>

          <div className="space-y-2">
            {contactLocked && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Lock className="size-3" />
                <span>명함에서 불러온 연락처입니다.</span>
                <button
                  type="button"
                  onClick={() => setContactLocked(false)}
                  className="text-primary hover:underline"
                >
                  직접 입력
                </button>
              </div>
            )}
            <div className="grid grid-cols-2 gap-4">
              <Field label="이메일" htmlFor="contact_email">
                <Input
                  id="contact_email"
                  name="contact_email"
                  type="email"
                  placeholder="name@example.com"
                  value={contactEmail}
                  onChange={(e) => setContactEmail(e.target.value)}
                  readOnly={contactLocked}
                  className={cn(contactLocked && "bg-muted/50 text-muted-foreground")}
                />
              </Field>
              <Field label="휴대폰" htmlFor="contact_phone">
                <Input
                  id="contact_phone"
                  name="contact_phone"
                  placeholder="010-0000-0000"
                  value={contactPhone}
                  onChange={(e) => setContactPhone(e.target.value)}
                  readOnly={contactLocked}
                  className={cn(contactLocked && "bg-muted/50 text-muted-foreground")}
                />
              </Field>
            </div>
          </div>

          <Field label="개요·성향 메모" htmlFor="investor_description">
            <Textarea id="investor_description" name="investor_description" />
          </Field>

          <div className="space-y-3 rounded-md bg-muted/40 p-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">조합</p>
              <Button
                type="button"
                variant="outline"
                size="xs"
                onClick={addFundRow}
              >
                <Plus />
                조합 추가
              </Button>
            </div>
            {fundKeys.map((key, idx) => (
              <div
                key={key}
                className="space-y-2 rounded-md border border-border bg-background p-2.5"
              >
                <div className="flex items-center gap-2">
                  <Input
                    name="fund_name"
                    placeholder={`조합명${idx === 0 ? "" : ` ${idx + 1}`}`}
                    aria-label="조합명"
                  />
                  {fundKeys.length > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label="조합 행 삭제"
                      onClick={() => removeFundRow(key)}
                    >
                      <X />
                    </Button>
                  )}
                </div>
                <Input name="fund_main_purpose" placeholder="주목적" />
                <Input name="fund_notes" placeholder="비고" />
              </div>
            ))}
          </div>
        </div>
    </div>
  );
}
