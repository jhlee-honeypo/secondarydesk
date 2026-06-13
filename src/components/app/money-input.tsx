"use client";

import { useState } from "react";

import { Input } from "@/components/ui/input";

/** 숫자 입력 시 1,000단위 콤마를 자동으로 붙여 표시하는 컨트롤드 입력.
 *  서버 액션의 num() 이 콤마를 제거하므로 저장 값에는 영향이 없다. */
export function MoneyInput({
  id,
  name,
  defaultValue,
  placeholder,
  value: controlledValue,
  onValueChange,
}: {
  id?: string;
  name: string;
  defaultValue?: number | null;
  placeholder?: string;
  // 제어형: value(숫자) + onValueChange 를 주면 외부 상태로 동작(프리필용).
  value?: number | null;
  onValueChange?: (next: number | null) => void;
}) {
  const format = (digits: string) =>
    digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const controlled = controlledValue !== undefined;
  const [internal, setInternal] = useState(
    defaultValue != null ? format(String(defaultValue)) : "",
  );
  const shown = controlled
    ? controlledValue != null
      ? format(String(controlledValue))
      : ""
    : internal;

  return (
    <Input
      id={id}
      name={name}
      inputMode="numeric"
      placeholder={placeholder}
      value={shown}
      onChange={(e) => {
        const digits = e.target.value.replace(/[^\d]/g, "");
        if (controlled) {
          onValueChange?.(digits === "" ? null : Number(digits));
        } else {
          setInternal(format(digits));
        }
      }}
    />
  );
}
