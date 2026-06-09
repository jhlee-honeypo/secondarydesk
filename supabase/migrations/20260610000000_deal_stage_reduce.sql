-- =============================================================================
-- SecondaryDesk — 딜 단계(deal_stage) 5단계로 축소
-- =============================================================================
-- 변경: 9단계 → 5단계 ('컨택','기업소개','IR·실사','클로징','드랍')
--   기존값 매핑:
--     롱리스트·컨택            → 컨택
--     미팅·자료검토            → 기업소개
--     딜리전스/IR              → IR·실사
--     협상/텀시트·클로징·Won   → 클로징
--     Lost                     → 드랍
--   기본값: '롱리스트' → '컨택'
-- 적용: Supabase 대시보드 > SQL Editor 에 붙여넣고 실행. (한 번만 — 재실행 시 무시)
-- =============================================================================

do $$
begin
  -- 이미 새 단계로 전환되었으면 건너뜀(재실행 안전)
  if exists (
    select 1
      from pg_enum e
      join pg_type t on t.oid = e.enumtypid
     where t.typname = 'deal_stage'
       and e.enumlabel = '드랍'
  ) then
    return;
  end if;

  -- 1) 기본값 제거(타입 변경을 위해)
  alter table public.deals alter column stage drop default;

  -- 2) text 로 임시 전환(enum 의존성 해제)
  alter table public.deals alter column stage type text using stage::text;

  -- 3) 기존 값 → 신규 5단계 매핑
  update public.deals set stage = case stage
    when '롱리스트'    then '컨택'
    when '컨택'        then '컨택'
    when '미팅'        then '기업소개'
    when '자료검토'    then '기업소개'
    when '딜리전스/IR' then 'IR·실사'
    when '협상/텀시트' then '클로징'
    when '클로징'      then '클로징'
    when 'Won'         then '클로징'
    when 'Lost'        then '드랍'
    else '컨택'
  end;

  -- 4) enum 재정의
  drop type public.deal_stage;
  create type public.deal_stage as enum
    ('컨택', '기업소개', 'IR·실사', '클로징', '드랍');

  -- 5) 컬럼 복원 + 기본값 재설정
  alter table public.deals
    alter column stage type public.deal_stage using stage::public.deal_stage;
  alter table public.deals alter column stage set default '컨택';
end $$;
