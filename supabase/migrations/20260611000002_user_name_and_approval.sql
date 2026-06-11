-- =============================================================================
-- SecondaryDesk — 회원가입(성/이름) + 승인제
-- =============================================================================
-- 1) users 에 성(last_name)·이름(first_name)·승인여부(approved) 추가
-- 2) 기존 사용자는 모두 승인 처리(잠금 방지), 주 관리자 계정은 lead + 성/이름 채움
-- 3) handle_new_user 트리거: 가입 메타데이터(first_name/last_name)로 이름 구성,
--    신규 가입자는 approved=false(기본값) → 관리자 승인 전 접근 차단
-- 4) lead 가 타 사용자 행을 승인/거부할 수 있도록 RLS 정책 추가
-- 재실행 안전(if not exists / drop ... if exists).
-- =============================================================================

alter table public.users
  add column if not exists first_name text,   -- 이름(성 제외). 카드 표시용 (예: 준행)
  add column if not exists last_name  text,   -- 성 (예: 이)
  add column if not exists approved   boolean not null default false;

comment on column public.users.first_name is '이름(성 제외) — 딜 카드 담당자 표기용';
comment on column public.users.last_name  is '성';
comment on column public.users.approved   is '관리자 승인 여부 — 미승인 시 앱 접근 차단';

-- 기존 사용자(이 마이그레이션 이전 생성)는 모두 승인 처리해 잠금 방지
update public.users set approved = true where approved = false;

-- 주 관리자 계정: lead 권한 부여 + 성/이름/성명 지정 (예시 기준 이준행)
update public.users
   set role       = 'lead',
       approved   = true,
       last_name  = '이',
       first_name = '준행',
       name       = '이준행'
 where email = 'jh.lee@sparklabs.co.kr';

-- -----------------------------------------------------------------------------
-- 신규 인증 사용자 → public.users 프로필 생성 (성/이름 반영, 미승인 상태)
--   name = 성+이름(예: 이준행), 없으면 메타 name, 그래도 없으면 이메일 앞부분.
-- -----------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_last  text := nullif(trim(new.raw_user_meta_data->>'last_name'), '');
  v_first text := nullif(trim(new.raw_user_meta_data->>'first_name'), '');
begin
  insert into public.users (id, email, name, first_name, last_name, role)
  values (
    new.id,
    new.email,
    coalesce(
      nullif(trim(concat(v_last, v_first)), ''),
      new.raw_user_meta_data->>'name',
      split_part(new.email, '@', 1)
    ),
    v_first,
    v_last,
    'member'
  )
  on conflict (id) do nothing;  -- approved 는 컬럼 기본값(false) 적용
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- lead 권한 체크 헬퍼 (RLS 정책에서 동일 테이블 재귀 방지를 위해 security definer)
-- -----------------------------------------------------------------------------
create or replace function public.is_lead()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.users where id = auth.uid() and role = 'lead'
  );
$$;

-- lead 는 타 사용자 행을 수정(승인/권한)하고 거부(삭제)할 수 있다.
--   (기존 users_update_self 정책과 OR 로 함께 적용됨)
drop policy if exists users_update_lead on public.users;
create policy users_update_lead on public.users
  for update to authenticated
  using (public.is_lead())
  with check (public.is_lead());

drop policy if exists users_delete_lead on public.users;
create policy users_delete_lead on public.users
  for delete to authenticated
  using (public.is_lead() and id <> auth.uid());
