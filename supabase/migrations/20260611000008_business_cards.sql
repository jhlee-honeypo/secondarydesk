-- =============================================================================
-- SecondaryDesk — 명함 백데이터(business_cards)
-- =============================================================================
-- 리멤버 등 명함 엑셀을 투자사/컨택으로 바로 생성하지 않고, 검색용 백데이터로만
-- 보관한다. 딜 등록·미팅 기록 시 사람 이름으로 검색해 투자사·컨택 입력을 자동으로
-- 채우는 소스로 쓴다. 동명이인은 company(소속)로 구분한다.
-- 기존 테이블은 건드리지 않으므로 운영 중 적용해도 안전하다.
-- 재실행 안전(if not exists / drop policy if exists).
-- =============================================================================

create table if not exists public.business_cards (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,            -- 사람 이름(검색 키)
  company     text,                     -- 소속(회사명) — 동명이인 구분
  title       text,                     -- 부서+직위 합본
  email       text,
  phone       text,
  met_date    date,                     -- 명함 받은 날짜
  notes       text,
  created_at  timestamptz not null default now()
);

comment on table public.business_cards is '명함 백데이터(검색용) — 투자사/컨택 자동생성 안 함';

-- 검색용 인덱스(이름·소속 대소문자 무시 ilike 가속)
create index if not exists idx_business_cards_name    on public.business_cards (lower(name));
create index if not exists idx_business_cards_company on public.business_cards (lower(company));

-- RLS: 다른 공용 자산과 동일하게 인증 팀 구성원 전체 허용
alter table public.business_cards enable row level security;

drop policy if exists business_cards_team_all on public.business_cards;
create policy business_cards_team_all on public.business_cards
  for all to authenticated using (true) with check (true);
