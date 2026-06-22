-- =============================================================================
-- SecondaryDesk — investor_aliases (투자사 별칭)
-- =============================================================================
-- 투자사명을 하나의 정규 레코드(가능하면 DIVA 기준명)로 모으기 위한 별칭 테이블.
-- 리멤버 명함·수기 입력에서 들어온 표기가 DIVA 정규명과 다를 때, 새 투자사를
-- 만드는 대신 기존 정규 레코드에 "별칭"으로 붙여 검색·자동연결에 사용한다.
--   예) 정규명 "○○벤처투자"  ← 별칭 "○○벤처스", "○○벤처투자(주)"
-- 매칭은 앱 레이어에서 normName(소문자·법인격·공백·구두점 제거)으로 수행한다.
-- source: 별칭이 어디서 왔는지(card=명함 / manual=수기 / merge=병합 / diva).
-- 적용: Supabase 대시보드 > SQL Editor 에 붙여넣고 실행. (재실행 안전)
-- =============================================================================

create table if not exists public.investor_aliases (
  id          uuid primary key default gen_random_uuid(),
  investor_id uuid not null references public.investors (id) on delete cascade,
  alias       text not null,
  source      text,                 -- 'card' | 'manual' | 'merge' | 'diva'
  created_at  timestamptz not null default now()
);

comment on table public.investor_aliases is '투자사 별칭 — 표기 변형을 정규 레코드로 모으는 검색/자동연결 키';

create index if not exists idx_investor_aliases_investor
  on public.investor_aliases (investor_id);

-- 같은 투자사에 동일 별칭(대소문자 무시) 중복 방지
create unique index if not exists uq_investor_aliases_per_investor
  on public.investor_aliases (investor_id, lower(alias));

-- RLS: 다른 공용 자산과 동일하게 인증 팀 구성원 전체 허용
alter table public.investor_aliases enable row level security;

drop policy if exists investor_aliases_team_all on public.investor_aliases;
create policy investor_aliases_team_all on public.investor_aliases
  for all to authenticated using (true) with check (true);
