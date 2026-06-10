"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";

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

export type InvestorOption = { id: string; name: string };

// 로컬 기준 오늘 날짜(YYYY-MM-DD). 날짜 입력 기본값용.
function todayLocal(): string {
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
}: {
  investors: InvestorOption[];
  /** 새 투자사 "일자(만난 일자)" 입력 노출 여부. 미팅 기록처럼 상위 폼이
   *  별도 일자를 갖는 경우 false 로 숨긴다. */
  showMetDate?: boolean;
}) {
  const [mode, setMode] = useState<"new" | "existing">("new");
  const [investorId, setInvestorId] = useState("");
  const [fundKeys, setFundKeys] = useState<number[]>([0]);

  function addFundRow() {
    setFundKeys((keys) => [...keys, (keys[keys.length - 1] ?? 0) + 1]);
  }
  function removeFundRow(key: number) {
    setFundKeys((keys) => keys.filter((k) => k !== key));
  }

  return (
    <div className="space-y-3">
      <input type="hidden" name="investor_mode" value={mode} />

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
            onValueChange={setInvestorId}
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
          <Input name="investor_name" placeholder="투자사명" required />
        )}
      </Field>

      {/* 새 투자사 상세 — 등록 모드에서만 */}
      {mode === "new" && (
        <div className="space-y-4 rounded-lg border border-border p-3">
          <div className="grid grid-cols-2 gap-4">
            <Field label="유형">
              <Select name="investor_type">
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

            {showMetDate && (
              <Field label="일자" htmlFor="investor_met_date">
                <Input
                  id="investor_met_date"
                  name="investor_met_date"
                  type="date"
                  defaultValue={todayLocal()}
                />
              </Field>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Field label="컨택 심사역" htmlFor="contact_name">
              <Input id="contact_name" name="contact_name" placeholder="이름" />
            </Field>
            <Field label="직책" htmlFor="contact_title">
              <Input
                id="contact_title"
                name="contact_title"
                placeholder="상무 / 심사역 등"
              />
            </Field>
          </div>

          <Field label="개요·성향 메모" htmlFor="investor_description">
            <Textarea id="investor_description" name="investor_description" />
          </Field>

          <div className="space-y-3 rounded-md bg-muted/40 p-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">조합 (선택)</p>
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
      )}
    </div>
  );
}
