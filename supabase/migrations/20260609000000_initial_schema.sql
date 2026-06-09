-- =============================================================================
-- SecondaryDesk — Step 1: 스키마 마이그레이션 (PRD §4 전체)
-- =============================================================================
-- 적용 방법(둘 중 하나):
--   A. Supabase 대시보드 > SQL Editor 에 이 파일 내용을 붙여넣고 실행
--   B. Supabase CLI:  supabase db push   (supabase/migrations/* 자동 적용)
-- 이 파일은 스키마(enum·테이블·인덱스·트리거)만 정의한다. RLS 정책은
-- 20260609000001_rls_policies.sql 에서 별도로 적용한다.
-- 멱등 실행을 위해 enum 은 존재 여부를 확인하고, 객체는 if not exists 를 사용.
-- =============================================================================

-- gen_random_uuid() 제공 (Supabase 기본 활성화이나 안전하게 보장)
create extension if not exists pgcrypto;

-- -----------------------------------------------------------------------------
-- 1. ENUM 타입 (PRD §4 의 enum 정의를 그대로 따름)
-- -----------------------------------------------------------------------------
do $$ begin
  -- §4.9 User.role
  if not exists (select 1 from pg_type where typname = 'user_role') then
    create type user_role as enum ('member', 'lead');
  end if;

  -- §4.1 Investor.type
  if not exists (select 1 from pg_type where typname = 'investor_type') then
    create type investor_type as enum
      ('VC', 'CVC', 'PEF', 'AC', '자산운용', '증권사', '패밀리오피스', '기타');
  end if;

  -- §4.1 Investor.tier
  if not exists (select 1 from pg_type where typname = 'investor_tier') then
    create type investor_tier as enum ('A', 'B', 'C');
  end if;

  -- §4.2 Fund.secondary_appetite
  if not exists (select 1 from pg_type where typname = 'secondary_appetite') then
    create type secondary_appetite as enum ('적극', '가능', '불가', '미상');
  end if;

  -- §4.4 Listing.status
  if not exists (select 1 from pg_type where typname = 'listing_status') then
    create type listing_status as enum ('준비중', '세일즈중', '거래완료', '보류');
  end if;

  -- §4.5 HoldingFund.status
  if not exists (select 1 from pg_type where typname = 'holding_fund_status') then
    create type holding_fund_status as enum ('운용중', '청산준비', '만기');
  end if;

  -- §4.7 Deal.stage (선언 순서 = 파이프라인 순서, 정렬에 활용)
  if not exists (select 1 from pg_type where typname = 'deal_stage') then
    create type deal_stage as enum
      ('롱리스트', '컨택', '미팅', '자료검토', '딜리전스/IR', '협상/텀시트', '클로징', 'Won', 'Lost');
  end if;

  -- §4.8 Activity.type
  if not exists (select 1 from pg_type where typname = 'activity_type') then
    create type activity_type as enum
      ('미팅', '통화', '이메일', '메신저', '자료발송', 'IR', '노트');
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- 2. 공통 트리거 함수: updated_at 자동 갱신
-- -----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- 3. 테이블
-- -----------------------------------------------------------------------------

-- §4.9 User (구성원) — Supabase auth.users 와 1:1 프로필
create table if not exists public.users (
  id         uuid primary key references auth.users (id) on delete cascade,
  name       text,
  email      text,
  role       user_role not null default 'member',
  created_at timestamptz not null default now()
);

-- §4.1 Investor (투자사)
create table if not exists public.investors (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  type        investor_type not null,
  tier        investor_tier,
  website     text,
  description text,
  owner_id    uuid references public.users (id) on delete set null,  -- 1차 담당(공용 자산)
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- §4.2 Fund (조합) — 매수 측, Investor 1:N Fund
create table if not exists public.funds (
  id                 uuid primary key default gen_random_uuid(),
  investor_id        uuid not null references public.investors (id) on delete cascade,
  name               text not null,
  vintage            int,
  aum                numeric,          -- 결성 총액 (KRW)
  dry_powder         numeric,          -- 잔여 투자가능 재원
  main_purpose       text,
  stage_focus        text[],           -- Seed / Pre-A / Series A / B+ / Growth / Secondary
  sector_focus       text[],           -- 섹터 태그(멀티)
  maturity_date      date,             -- 조합 만기일
  check_size_min     numeric,
  check_size_max     numeric,
  secondary_appetite secondary_appetite,  -- 구주 인수 선호도
  notes              text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

-- §4.3 Contact (컨택) — Investor 1:N Contact
create table if not exists public.contacts (
  id                uuid primary key default gen_random_uuid(),
  investor_id       uuid not null references public.investors (id) on delete cascade,
  name              text not null,
  title             text,
  is_decision_maker boolean not null default false,
  email             text,
  phone             text,
  notes             text,
  last_contacted_at timestamptz,       -- 활동 기록 시 자동 갱신(아래 트리거)
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- §4.4 Listing (매물/구주) — 우리가 파는 측(회사 단위)
create table if not exists public.listings (
  id               uuid primary key default gen_random_uuid(),
  company_name     text not null,
  status           listing_status not null default '준비중',
  sector           text,
  stage            text,
  asking_valuation numeric,
  summary          text,
  deck_url         text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- §4.5 HoldingFund (운용펀드) — 우리가 운용·매각하는 펀드
create table if not exists public.holding_funds (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  vintage       int,
  maturity_date date,
  status        holding_fund_status,
  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- §4.6 ListingFund (매물 × 운용펀드 태그) — Listing N:M HoldingFund
create table if not exists public.listing_funds (
  id              uuid primary key default gen_random_uuid(),
  listing_id      uuid not null references public.listings (id) on delete cascade,
  holding_fund_id uuid not null references public.holding_funds (id) on delete cascade,
  unique (listing_id, holding_fund_id)   -- 동일 매물×펀드 중복 방지
);

-- §4.7 Deal (딜) — 매물 × 투자사 교차점
create table if not exists public.deals (
  id                uuid primary key default gen_random_uuid(),
  listing_id        uuid not null references public.listings (id) on delete cascade,
  investor_id       uuid not null references public.investors (id) on delete cascade,
  fund_id           uuid references public.funds (id) on delete set null,  -- 어느 조합 대상(선택)
  owner_id          uuid not null references public.users (id),            -- 담당 심사역
  stage             deal_stage not null default '롱리스트',
  intro_path        text,        -- 소개 경로(네트워크 추적)
  expected_amount   numeric,
  probability       int check (probability is null or probability between 0 and 100),
  next_action       text,
  next_action_date  date,
  target_close_date date,
  lost_reason       text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (listing_id, investor_id)  -- 동일 매물×투자사 중복 딜 방지(§4.7, F6)
);

-- §4.8 Activity (활동/타임라인) — Deal 1:N Activity
create table if not exists public.activities (
  id             uuid primary key default gen_random_uuid(),
  deal_id        uuid references public.deals (id) on delete cascade,    -- 투자사 단위 기록 시 null 허용
  investor_id    uuid not null references public.investors (id) on delete cascade,
  contact_id     uuid references public.contacts (id) on delete set null,
  type           activity_type not null,
  occurred_at    timestamptz not null,
  content        text not null,
  author_id      uuid not null references public.users (id),
  attachment_url text,
  created_at     timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- 4. 인덱스 (외래키 조회 성능 — 상세 통합 뷰·파이프라인·타임라인에서 빈번)
-- -----------------------------------------------------------------------------
create index if not exists idx_investors_owner       on public.investors (owner_id);
create index if not exists idx_funds_investor         on public.funds (investor_id);
create index if not exists idx_contacts_investor      on public.contacts (investor_id);
create index if not exists idx_listing_funds_listing  on public.listing_funds (listing_id);
create index if not exists idx_listing_funds_fund     on public.listing_funds (holding_fund_id);
create index if not exists idx_deals_listing          on public.deals (listing_id);
create index if not exists idx_deals_investor         on public.deals (investor_id);
create index if not exists idx_deals_owner            on public.deals (owner_id);
create index if not exists idx_deals_stage            on public.deals (stage);
create index if not exists idx_activities_deal        on public.activities (deal_id);
create index if not exists idx_activities_investor    on public.activities (investor_id);
create index if not exists idx_activities_contact     on public.activities (contact_id);

-- -----------------------------------------------------------------------------
-- 5. updated_at 트리거 부착 (updated_at 컬럼 보유 테이블)
-- -----------------------------------------------------------------------------
drop trigger if exists trg_investors_updated_at    on public.investors;
drop trigger if exists trg_funds_updated_at        on public.funds;
drop trigger if exists trg_contacts_updated_at     on public.contacts;
drop trigger if exists trg_listings_updated_at     on public.listings;
drop trigger if exists trg_holding_funds_updated_at on public.holding_funds;
drop trigger if exists trg_deals_updated_at        on public.deals;

create trigger trg_investors_updated_at     before update on public.investors     for each row execute function public.set_updated_at();
create trigger trg_funds_updated_at         before update on public.funds         for each row execute function public.set_updated_at();
create trigger trg_contacts_updated_at      before update on public.contacts      for each row execute function public.set_updated_at();
create trigger trg_listings_updated_at      before update on public.listings      for each row execute function public.set_updated_at();
create trigger trg_holding_funds_updated_at before update on public.holding_funds for each row execute function public.set_updated_at();
create trigger trg_deals_updated_at         before update on public.deals         for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- 6. 활동 기록 시 컨택의 last_contacted_at 자동 갱신 (§4.3, F5)
--    contact_id 가 지정된 활동 삽입 시 더 최근 시각으로만 갱신.
-- -----------------------------------------------------------------------------
create or replace function public.touch_contact_last_contacted()
returns trigger
language plpgsql
as $$
begin
  if new.contact_id is not null then
    update public.contacts
       set last_contacted_at = greatest(coalesce(last_contacted_at, new.occurred_at), new.occurred_at)
     where id = new.contact_id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_activity_touch_contact on public.activities;
create trigger trg_activity_touch_contact
  after insert on public.activities
  for each row execute function public.touch_contact_last_contacted();

-- -----------------------------------------------------------------------------
-- 7. 신규 인증 사용자 → public.users 프로필 자동 생성 (Step 2 인증과 연동)
--    security definer 로 RLS 우회하여 삽입.
-- -----------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.users (id, email, name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    'member'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
