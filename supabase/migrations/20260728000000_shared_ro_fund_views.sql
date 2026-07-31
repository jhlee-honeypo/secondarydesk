-- =============================================================================
-- 동료 프로젝트용 읽기 전용 공유 — 펀드(외부 조합) + 운용펀드
-- =============================================================================
-- 왜 이렇게 하나:
--   원본 테이블을 직접 열어주면 (a) 어떤 컬럼까지 보이는지 통제가 안 되고
--   (b) 나중에 컬럼이 추가될 때 자동으로 노출된다. 그래서 공유 전용 스키마에
--   '뷰'만 두고, 동료 role 에는 그 스키마만 준다.
--
-- 왜 뷰가 RLS 를 통과하나:
--   원본 테이블은 RLS 가 켜져 있고 정책이 to authenticated 로 한정돼 있어,
--   커스텀 role 로 직접 조회하면 정책이 매칭되지 않아 0행이 나온다.
--   뷰는 기본값(security_invoker = off)에서 '뷰 소유자(postgres)'의 권한으로
--   실행되므로 원본 RLS 에 막히지 않는다. → 이 뷰에 security_invoker 를
--   켜면 안 된다(켜면 0행이 된다).
--
-- 쓰기가 불가능한 근거:
--   role 에 준 권한이 select 뿐이고, public 스키마에는 어떤 권한도 주지 않는다.
--
-- 비밀번호는 이 파일에 두지 않는다(git 에 남으므로). 적용 후 별도로
--   alter role fund_reader with password '...';
-- 를 실행한다. 비밀번호가 없으면 로그인 자체가 불가하므로 안전한 기본값이다.
--
-- 재실행 안전(if not exists / create or replace).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) 공유 전용 스키마
-- -----------------------------------------------------------------------------
create schema if not exists shared_ro;

comment on schema shared_ro is
  '외부(동료 프로젝트) 읽기 전용 공유용. 여기에는 뷰만 두고 원본 테이블은 두지 않는다.';

-- -----------------------------------------------------------------------------
-- 2) 동료 전용 로그인 role — 비밀번호는 별도 설정
-- -----------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'fund_reader') then
    create role fund_reader with login;
  end if;
end $$;

-- (role 에는 comment 를 달지 않는다 — comment on role 은 CREATEROLE 권한을 요구해
--  환경에 따라 실패하고, 그 한 줄 때문에 마이그레이션 전체가 롤백된다.)
--  fund_reader 의 용도: 동료 프로젝트 읽기 전용. shared_ro 의 뷰만 select 가능.

grant usage on schema shared_ro to fund_reader;

-- -----------------------------------------------------------------------------
-- 3) 펀드(외부 조합) — funds 2,884건
--    제외: notes(내부 메모) · secondary_appetite(우리 내부 평가)
--    추가: investor_name — investor_id 만으로는 UUID 라 쓸 수 없어 이름을 붙인다.
--          투자사 테이블 자체는 노출하지 않는다.
-- -----------------------------------------------------------------------------
create or replace view shared_ro.external_funds as
  select
    f.id,
    f.investor_id,
    i.name as investor_name,
    f.name,
    f.vintage,
    f.formation_date,
    f.maturity_date,
    f.aum,
    f.dry_powder,
    f.main_purpose,
    f.stage_focus,
    f.sector_focus,
    f.check_size_min,
    f.check_size_max,
    f.diva_asct_id,
    f.created_at,
    f.updated_at
  from public.funds f
  left join public.investors i on i.id = f.investor_id;

comment on view shared_ro.external_funds is '외부 투자사가 운용하는 펀드(조합) 정보';

comment on column shared_ro.external_funds.investor_id       is '소속 투자사 ID';
comment on column shared_ro.external_funds.investor_name     is '소속 투자사명';
comment on column shared_ro.external_funds.name              is '펀드명';
comment on column shared_ro.external_funds.vintage           is '결성연도';
comment on column shared_ro.external_funds.formation_date    is '결성일';
comment on column shared_ro.external_funds.maturity_date     is '만기일';
comment on column shared_ro.external_funds.aum               is '운용규모(AUM)';
comment on column shared_ro.external_funds.dry_powder        is '미집행 자금(잔여 재원)';
comment on column shared_ro.external_funds.main_purpose      is '펀드 주목적';
comment on column shared_ro.external_funds.stage_focus       is '투자단계 선호(복수)';
comment on column shared_ro.external_funds.sector_focus      is '섹터 선호(복수)';
comment on column shared_ro.external_funds.check_size_min    is '1건당 최소 투자규모';
comment on column shared_ro.external_funds.check_size_max    is '1건당 최대 투자규모';
comment on column shared_ro.external_funds.diva_asct_id      is 'DIVA 외부 시스템 식별자';

-- -----------------------------------------------------------------------------
-- 4) 우리 운용펀드 — holding_funds 22건
--    제외: commitment(약정액) — 데이터 모델 §5 접근 티어에서 analyst_only
--          notes(내부 메모)
-- -----------------------------------------------------------------------------
create or replace view shared_ro.holding_funds as
  select
    h.id,
    h.name,
    h.short_name,
    h.vintage,
    h.maturity_date,
    h.status,
    h.bubble_id,
    h.created_at,
    h.updated_at
  from public.holding_funds h;

comment on view shared_ro.holding_funds is '우리가 운용하는 조합(약정액·내부메모 제외)';

comment on column shared_ro.holding_funds.name          is '조합명';
comment on column shared_ro.holding_funds.short_name    is '조합 약칭';
comment on column shared_ro.holding_funds.vintage       is '빈티지(결성연도)';
comment on column shared_ro.holding_funds.maturity_date is '만기일';
comment on column shared_ro.holding_funds.status        is '운용 상태';
comment on column shared_ro.holding_funds.bubble_id     is 'slab(sparkERP) 조합 ID — 연결 키';

-- -----------------------------------------------------------------------------
-- 5) 읽기 권한만. 앞으로 shared_ro 에 추가되는 뷰도 자동으로 읽기 전용이 된다.
-- -----------------------------------------------------------------------------
grant select on all tables in schema shared_ro to fund_reader;

alter default privileges in schema shared_ro
  grant select on tables to fund_reader;

-- 원본 스키마는 어떤 권한도 주지 않는다(명시적 확인용 — 기본값이 이미 무권한).
revoke all on schema public from fund_reader;
