-- =============================================================================
-- SecondaryDesk — 매물×운용펀드 취급상태(펀드 포지션 단위)
-- =============================================================================
-- 배경: listings.status 는 slab company."company investment status"(= 회사 존속상태)를
-- 동기화해 왔다. 우리가 실제로 그 회사를 어떻게 취급 중인지는 slab
-- sparklabinvestment."investment status"(= 펀드별 포지션)에 있어서, 회사는 Live 인데
-- 우리 포지션은 상각(Written-off)인 경우가 매물 316건 중 95건이었다(2026-08-04 실측).
-- 게다가 한 회사를 여러 펀드가 서로 다른 상태로 보유하기도 한다
-- (예: ㈜블로코 = SKF1 상각 / Ignition1 Live). 그래서 상태는 매물×펀드 단위로 둔다.
--
-- 값은 slab 원문(Live / Written-off / Exit)에 대응한다. listings.status 의
-- "ON SALE" 은 ERP 에 없는 영업값이라 이 enum 에는 넣지 않는다.
-- =============================================================================

do $$
begin
  if not exists (select 1 from pg_type where typname = 'position_status') then
    create type position_status as enum ('LIVE', 'EXIT', 'W/O');
  end if;
end $$;

alter table public.listing_funds
  add column if not exists position_status position_status;

comment on column public.listing_funds.position_status is
  '이 펀드의 해당 매물 취급상태 — slab sparklabinvestment."investment status" 동기화. NULL=ERP 투자내역 없음(수기 태그 등)';
