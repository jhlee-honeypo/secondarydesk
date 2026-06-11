"use client";

import { useRef, useState } from "react";
import { Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatWon } from "@/lib/format";

export type RoundSeed = {
  label: string | null;
  unit_price: number;
  shares: number;
  amount: number;
};

type Row = {
  key: number;
  label: string;
  price: string;
  shares: string;
  amount: string;
  amountAuto: boolean;
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
 * 매물 폼의 "투자 데이터(선택)" 섹션 — 라운드별 단가·주식수·투자액 입력.
 * 입력값은 parallel array(round_label·round_price·round_shares·round_amount)로
 * 폼에 실려 createListing/updateListing 이 exit_scenario_rounds 와 동기화한다.
 * hidden rounds_present 마커로 "라운드 섹션이 제출됨"을 서버에 알린다.
 */
export function RoundsEditor({ initial = [] }: { initial?: RoundSeed[] }) {
  const keyRef = useRef(0);
  const [rows, setRows] = useState<Row[]>(() =>
    initial.length > 0
      ? initial.map((s) => ({
          key: keyRef.current++,
          label: s.label ?? "",
          price: s.unit_price ? String(s.unit_price) : "",
          shares: s.shares ? String(s.shares) : "",
          amount: s.amount ? String(s.amount) : "",
          amountAuto: false,
        }))
      : [
          {
            key: keyRef.current++,
            label: "",
            price: "",
            shares: "",
            amount: "",
            amountAuto: true,
          },
        ],
  );

  function patch(key: number, p: Partial<Row>) {
    setRows((cur) => cur.map((r) => (r.key === key ? { ...r, ...p } : r)));
  }
  function addRow() {
    setRows((cur) => [
      ...cur,
      {
        key: keyRef.current++,
        label: "",
        price: "",
        shares: "",
        amount: "",
        amountAuto: true,
      },
    ]);
  }
  function removeRow(key: number) {
    setRows((cur) => {
      const next = cur.filter((r) => r.key !== key);
      return next.length > 0
        ? next
        : [
            {
              key: keyRef.current++,
              label: "",
              price: "",
              shares: "",
              amount: "",
              amountAuto: true,
            },
          ];
    });
  }
  function onAmount(key: number, val: string) {
    const d = digitsOnly(val);
    patch(key, d === "" ? { amount: "", amountAuto: true } : { amount: d, amountAuto: false });
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
        </p>
      </div>

      <div className="hidden grid-cols-[1fr_1.2fr_1fr_1.2fr_auto] gap-2 px-1 text-xs text-muted-foreground sm:grid">
        <span>라운드</span>
        <span className="text-right">투자 단가 (원/주)</span>
        <span className="text-right">보유 주식수</span>
        <span className="text-right">투자액 (원)</span>
        <span className="w-8" />
      </div>

      {rows.map((r, i) => (
        <div
          key={r.key}
          className="grid grid-cols-2 gap-2 sm:grid-cols-[1fr_1.2fr_1fr_1.2fr_auto]"
        >
          <Input
            name="round_label"
            value={r.label}
            onChange={(e) => patch(r.key, { label: e.target.value })}
            placeholder={`${i + 1}차`}
            aria-label="라운드명"
          />
          <Input
            name="round_price"
            inputMode="numeric"
            className="text-right"
            value={group(r.price)}
            onChange={(e) => patch(r.key, { price: digitsOnly(e.target.value) })}
            placeholder="단가"
            aria-label="투자 단가"
          />
          <Input
            name="round_shares"
            inputMode="numeric"
            className="text-right"
            value={group(r.shares)}
            onChange={(e) => patch(r.key, { shares: digitsOnly(e.target.value) })}
            placeholder="주식수"
            aria-label="보유 주식수"
          />
          <Input
            name="round_amount"
            inputMode="numeric"
            className="text-right"
            value={
              r.amountAuto
                ? rowAmount(r)
                  ? rowAmount(r).toLocaleString("ko-KR")
                  : ""
                : group(r.amount)
            }
            onChange={(e) => onAmount(r.key, e.target.value)}
            placeholder="자동(단가×주식수)"
            aria-label="투자액"
          />
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="라운드 삭제"
            className="justify-self-end"
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
