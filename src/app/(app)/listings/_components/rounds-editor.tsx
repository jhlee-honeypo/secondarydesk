"use client";

import { useRef, useState } from "react";
import { Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Field } from "@/components/app/field";
import { formatWon } from "@/lib/format";

export type RoundSeed = {
  label: string | null;
  unit_price: number;
  shares: number;
  amount: number;
  holding_fund_id: string | null;
};

type Row = {
  key: number;
  price: string;
  shares: string;
  amount: string;
  amountAuto: boolean;
  fundId: string; // "" = 미지정
};

const digitsOnly = (s: string) => s.replace(/[^\d]/g, "");
const toNum = (s: string) => Number(digitsOnly(s)) || 0;
const group = (s: string) => {
  const d = digitsOnly(s);
  return d ? Number(d).toLocaleString("ko-KR") : "";
};
const rowAmount = (r: Row) =>
  r.amountAuto ? toNum(r.price) * toNum(r.shares) : toNum(r.amount);

/**
 * 매물 폼의 "투자 데이터(선택)" 섹션 — 라운드별 소속 펀드·단가·주식수·투자액 입력.
 * 차수는 행 순서(위→아래 1차·2차…)로 자동 고정되며 수정 불가. parallel array
 * (round_fund_id·round_price·round_shares·round_amount)로 폼에 실려
 * createListing/updateListing 이 round_no=순서로 exit_scenario_rounds 와 동기화한다.
 * Radix Select 폼 제출 이슈를 피하려 소속 펀드는 제어형 Select + hidden input 사용.
 */
export function RoundsEditor({
  initial = [],
  funds = [],
  defaultFundId = null,
  initialLatestPrice = null,
}: {
  initial?: RoundSeed[];
  /** 소속 펀드 선택지(이 매물에 태깅된 운용펀드). 없으면 펀드 입력 숨김. */
  funds?: { id: string; name: string }[];
  /** 태깅 펀드가 1개면 신규 라운드의 기본 소속 펀드. */
  defaultFundId?: string | null;
  /** 최신(후속) 라운드 단가 — EXIT 기준 단가. */
  initialLatestPrice?: number | null;
}) {
  const hasFunds = funds.length > 0;
  const keyRef = useRef(0);

  const [latest, setLatest] = useState(
    initialLatestPrice ? String(initialLatestPrice) : "",
  );

  const blank = (): Row => ({
    key: keyRef.current++,
    price: "",
    shares: "",
    amount: "",
    amountAuto: true,
    fundId: defaultFundId ?? "",
  });

  const [rows, setRows] = useState<Row[]>(() =>
    initial.length > 0
      ? initial.map((s) => ({
          key: keyRef.current++,
          price: s.unit_price ? String(s.unit_price) : "",
          shares: s.shares ? String(s.shares) : "",
          amount: s.amount ? String(s.amount) : "",
          amountAuto: false,
          fundId: s.holding_fund_id ?? defaultFundId ?? "",
        }))
      : [blank()],
  );

  function patch(key: number, p: Partial<Row>) {
    setRows((cur) => cur.map((r) => (r.key === key ? { ...r, ...p } : r)));
  }
  function addRow() {
    setRows((cur) => [...cur, blank()]);
  }
  function removeRow(key: number) {
    setRows((cur) => {
      const next = cur.filter((r) => r.key !== key);
      return next.length > 0 ? next : [blank()];
    });
  }
  function onAmount(key: number, val: string) {
    const d = digitsOnly(val);
    patch(
      key,
      d === "" ? { amount: "", amountAuto: true } : { amount: d, amountAuto: false },
    );
  }

  const totalPrincipal = rows.reduce((s, r) => s + rowAmount(r), 0);
  const totalShares = rows.reduce((s, r) => s + toNum(r.shares), 0);
  const avg = totalShares > 0 ? totalPrincipal / totalShares : 0;

  return (
    <div className="space-y-3 rounded-lg border border-border p-3">
      <input type="hidden" name="rounds_present" value="1" />
      <div>
        <p className="text-sm font-medium">투자 데이터 (선택)</p>
        <p className="text-xs text-muted-foreground">
          라운드별 투자 단가·보유 주식수를 입력하면 EXIT 시나리오에서 매각 손익을
          시뮬레이션할 수 있습니다.
          {hasFunds && " 여러 펀드로 투자한 경우 라운드마다 소속 펀드를 지정하세요."}
        </p>
      </div>

      <Field
        label="최신 라운드 단가 (원/주)"
        htmlFor="latest_round_price"
        hint="우리 투자 이후 후속 라운드 단가 — EXIT 시뮬레이션 기준 단가로 사용됩니다. 미입력 시 마지막 투자 라운드 단가를 사용."
      >
        <Input
          id="latest_round_price"
          name="latest_round_price"
          inputMode="numeric"
          className="text-right sm:w-60"
          value={group(latest)}
          onChange={(e) => setLatest(digitsOnly(e.target.value))}
          placeholder="예: 190,520"
        />
      </Field>

      {/* 헤더 — 행 입력칸과 너비 정렬 */}
      <div className="flex items-center gap-1.5 px-0.5 text-xs text-muted-foreground">
        <span className="w-8 shrink-0">차수</span>
        {hasFunds && <span className="w-24 shrink-0">소속 펀드</span>}
        <span className="flex-1 text-right">단가(원/주)</span>
        <span className="flex-1 text-right">주식수</span>
        <span className="flex-1 text-right">투자액(원)</span>
        <span className="w-7 shrink-0" />
      </div>

      {rows.map((r, i) => (
        <div key={r.key} className="flex items-center gap-1.5">
          {/* 차수 — 자동 고정값(수정 불가) */}
          <span className="w-8 shrink-0 text-sm font-medium tabular-nums">
            {i + 1}차
          </span>
          {hasFunds && (
            <>
              <input type="hidden" name="round_fund_id" value={r.fundId} />
              <Select
                value={r.fundId || undefined}
                onValueChange={(v) => patch(r.key, { fundId: v })}
              >
                <SelectTrigger className="h-8 w-24 shrink-0" aria-label="소속 펀드">
                  <SelectValue placeholder="펀드" />
                </SelectTrigger>
                <SelectContent>
                  {funds.map((f) => (
                    <SelectItem key={f.id} value={f.id}>
                      {f.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </>
          )}
          <Input
            name="round_price"
            inputMode="numeric"
            className="h-8 min-w-0 flex-1 text-right"
            value={group(r.price)}
            onChange={(e) => patch(r.key, { price: digitsOnly(e.target.value) })}
            aria-label="투자 단가"
          />
          <Input
            name="round_shares"
            inputMode="numeric"
            className="h-8 min-w-0 flex-1 text-right"
            value={group(r.shares)}
            onChange={(e) => patch(r.key, { shares: digitsOnly(e.target.value) })}
            aria-label="보유 주식수"
          />
          <Input
            name="round_amount"
            inputMode="numeric"
            className="h-8 min-w-0 flex-1 text-right"
            value={
              r.amountAuto
                ? rowAmount(r)
                  ? rowAmount(r).toLocaleString("ko-KR")
                  : ""
                : group(r.amount)
            }
            onChange={(e) => onAmount(r.key, e.target.value)}
            aria-label="투자액"
          />
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="라운드 삭제"
            className="size-7 shrink-0"
            onClick={() => removeRow(r.key)}
          >
            <Trash2 />
          </Button>
        </div>
      ))}

      <Button type="button" variant="outline" size="sm" onClick={addRow}>
        <Plus />
        라운드 추가
      </Button>

      {totalShares > 0 && (
        <div className="flex flex-wrap gap-x-6 gap-y-1 border-t border-border pt-3 text-xs text-muted-foreground">
          <span>
            총 투자원금{" "}
            <span className="font-medium text-foreground">
              {formatWon(totalPrincipal)}원
            </span>
          </span>
          <span>
            총 보유 주식수{" "}
            <span className="font-medium text-foreground">
              {totalShares.toLocaleString("ko-KR")}주
            </span>
          </span>
          <span>
            가중평균 단가{" "}
            <span className="font-medium text-foreground">
              {formatWon(avg)}원/주
            </span>
          </span>
        </div>
      )}
    </div>
  );
}
