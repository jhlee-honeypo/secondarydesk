-- =============================================================================
-- SecondaryDesk — Step 1: RLS 정책 (PRD §8 보안/권한)
-- =============================================================================
-- 적용은 20260609000000_initial_schema.sql 이후에 실행한다.
--
-- 정책 모델(MVP):
--   - 본 제품은 단일 조직 내부용. 공용 자산(투자사·조합·컨택·매물·운용펀드·딜·활동)은
--     '인증된 팀 구성원'이면 모두 조회·편집 가능(§8.2 member 권한).
--   - 비로그인 사용자는 모든 데이터 접근 차단(§F1 수용 기준) — anon 역할에는 정책 없음.
--   - users 프로필은 전체 조회 가능(팀 디렉터리), 본인 행만 수정.
--
-- 향후(Step 2+) 강화 예정:
--   - 조직 외부인 가입 차단은 Supabase Auth 설정(공개가입 비활성/이메일 도메인 허용)에서 처리.
--   - lead 역할의 딜 재배정 등 세분화 권한(§8.2)은 인증 단계에서 정책 추가.
-- =============================================================================

-- 모든 테이블 RLS 활성화 (정책 없으면 기본 거부)
alter table public.users         enable row level security;
alter table public.investors     enable row level security;
alter table public.funds         enable row level security;
alter table public.contacts      enable row level security;
alter table public.listings      enable row level security;
alter table public.holding_funds enable row level security;
alter table public.listing_funds enable row level security;
alter table public.deals         enable row level security;
alter table public.activities    enable row level security;

-- -----------------------------------------------------------------------------
-- users — 팀 디렉터리: 전체 조회, 본인 프로필만 수정
--   (insert 는 handle_new_user 트리거가 security definer 로 수행, 정책 불필요)
-- -----------------------------------------------------------------------------
drop policy if exists users_select on public.users;
drop policy if exists users_update_self on public.users;

create policy users_select on public.users
  for select to authenticated using (true);

create policy users_update_self on public.users
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- -----------------------------------------------------------------------------
-- 공용 자산 테이블 — 인증된 팀 구성원은 전체 CRUD 허용
-- -----------------------------------------------------------------------------
do $$
declare
  t text;
  shared_tables text[] := array[
    'investors', 'funds', 'contacts', 'listings',
    'holding_funds', 'listing_funds', 'deals', 'activities'
  ];
begin
  foreach t in array shared_tables loop
    execute format('drop policy if exists %I on public.%I', t || '_team_all', t);
    execute format(
      'create policy %I on public.%I for all to authenticated using (true) with check (true)',
      t || '_team_all', t
    );
  end loop;
end $$;
