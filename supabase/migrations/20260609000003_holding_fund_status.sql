-- =============================================================================
-- SecondaryDesk — 운용펀드 상태(holding_fund_status) enum 재정의
-- =============================================================================
-- 변경: ('운용중','청산준비','만기')  →  ('운용 중','청산 준비','만기 연장','청산 완료')
--   - 운용중   → 운용 중   (띄어쓰기)
--   - 청산준비 → 청산 준비 (띄어쓰기)
--   - 만기     → 만기 연장 (의미 확장)
--   - 청산 완료            (신규 추가)
-- 적용: Supabase 대시보드 > SQL Editor 에 붙여넣고 실행. (한 번만 실행되면 됨 — 재실행 시 무시)
-- =============================================================================

do $$
begin
  -- 이미 새 값으로 전환되었으면 건너뜀(재실행 안전)
  if exists (
    select 1
      from pg_enum e
      join pg_type t on t.oid = e.enumtypid
     where t.typname = 'holding_fund_status'
       and e.enumlabel = '청산 완료'
  ) then
    return;
  end if;

  -- 1) 컬럼을 임시로 text 로 변경(enum 의존성 해제)
  alter table public.holding_funds
    alter column status type text using status::text;

  -- 2) 기존 값 → 새 라벨로 매핑(데이터가 있을 경우 대비)
  update public.holding_funds set status = case status
    when '운용중'   then '운용 중'
    when '청산준비' then '청산 준비'
    when '만기'     then '만기 연장'
    else status
  end;

  -- 3) enum 재정의
  drop type public.holding_fund_status;
  create type public.holding_fund_status as enum
    ('운용 중', '청산 준비', '만기 연장', '청산 완료');

  -- 4) 컬럼을 다시 enum 으로 복원
  alter table public.holding_funds
    alter column status type public.holding_fund_status
    using status::public.holding_fund_status;
end $$;
