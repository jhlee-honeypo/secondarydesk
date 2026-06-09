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
}: {
  id?: string;
  name: string;
  defaultValue?: number | null;
  placeholder?: string;
}) {
  const format = (digits: string) =>
    digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const [value, setValue] = useState(
    defaultValue != null ? format(String(defaultValue)) : "",
  );

  return (
    <Input
      id={id}
      name={name}
      inputMode="numeric"
      placeholder={placeholder}
      value={value}
      onChange={(e) => setValue(format(e.target.value.replace(/[^\d]/g, "")))}
    />
  );
}
