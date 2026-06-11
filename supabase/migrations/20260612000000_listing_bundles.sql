-- =============================================================================
-- SecondaryDesk — 매물 즐겨찾기 묶음(listing_bundles)
-- =============================================================================
-- 자주 함께 소개하는 매물 조합(예: "농식품 패키지")을 이름 붙여 저장해두고,
-- 딜 생성 시 매물 복수선택에서 한 번에 적용한다. 팀 공유(모든 구성원이 열람·사용).
-- 매물 id 목록은 uuid[] 배열로 보관(삭제된 매물 id는 적용 시 무시).
-- 기존 테이블은 건드리지 않으므로 운영 중 적용해도 안전하다.
-- 재실행 안전(if not exists / drop policy if exists).
-- =============================================================================

create table if not exists public.listing_bundles (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  listing_ids uuid[] not null default '{}',
  created_by  uuid references public.users (id),
  created_at  timestamptz not null default now()
);

comment on table public.listing_bundles is '매물 즐겨찾기 묶음(딜 생성 복수선택용, 팀 공유)';

create index if not exists idx_listing_bundles_name on public.listing_bundles (lower(name));

-- RLS: 다른 공용 자산과 동일하게 인증 팀 구성원 전체 허용
alter table public.listing_bundles enable row level security;

drop policy if exists listing_bundles_team_all on public.listing_bundles;
create policy listing_bundles_team_all on public.listing_bundles
  for all to authenticated using (true) with check (true);
