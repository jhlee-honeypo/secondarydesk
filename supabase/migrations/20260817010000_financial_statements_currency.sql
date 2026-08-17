-- =============================================================================
-- 재무제표 표기 통화 — financial_statements.currency
-- =============================================================================
-- 일부 포트폴리오사는 재무제표를 원화가 아닌 통화로 제출한다(휴스페이스·폴리머라이즈
-- = 달러, H2 Inc = 대만 달러 등). 지금까지는 모든 값을 원화로 간주해 표에 그대로
-- 찍었는데, 그러면 "매출 37,610" 을 3.7만원으로 읽게 되어 판단이 어긋난다.
--
-- 저장하는 값은 문서에 적힌 그 통화의 금액 그대로다(환산하지 않는다). 환율은 시점에
-- 따라 달라져 원화 환산을 저장하면 원본과 대조가 불가능해지고, 지금 화면이 원하는
-- 것은 "이 회사 재무제표에 뭐라고 적혀 있나" 이기 때문이다. 화면은 이 코드에 맞는
-- 기호($ · NT$ …)를 붙여 보여준다.
--
-- 통화는 추출 시 문서(단위 표기·통화 기호·열 머리글)에서 자동으로 판별한다.
-- 기본값 KRW — 기존 행과 한국 재무제표는 그대로 원화로 남는다.
-- ISO 4217 3자리 코드만 허용(형식만 검사 — 새 통화가 나와도 마이그레이션 없이 받는다).
-- 재실행 안전.

alter table public.financial_statements
  add column if not exists currency text not null default 'KRW';

do $$
begin
  alter table public.financial_statements
    add constraint financial_statements_currency_check
    check (currency ~ '^[A-Z]{3}$');
exception
  when duplicate_object then null;
end $$;

comment on column public.financial_statements.currency is
  '재무제표 표기 통화(ISO 4217) — 문서에서 자동 판별. 값은 이 통화 그대로 저장(원화 환산 아님)';
