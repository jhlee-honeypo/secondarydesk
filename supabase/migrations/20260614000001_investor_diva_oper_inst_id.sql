-- =============================================================================
-- SecondaryDesk — investors.diva_oper_inst_id (DIVA 운용사ID) 추가
-- =============================================================================
-- DIVA 조합 임포트 시 운용사(GP)를 식별하는 안정 키. DIVA에서 각 운용사는
-- OPER_INST_ID(예: OP20220645)로 고유 식별되며, 공동GP 조합이라도 같은 회사는
-- 항상 같은 ID를 가진다. 이 값으로 투자사를 find-or-create 해 중복 생성을 막고,
-- 기존 투자사는 이름 정확일치로 찾아 이 컬럼을 채운다(backfill).
-- 적용: Supabase 대시보드 > SQL Editor 에 붙여넣고 실행. (재실행 안전)
-- =============================================================================

alter table public.investors
  add column if not exists diva_oper_inst_id text;

create unique index if not exists uq_investors_diva_oper_inst
  on public.investors (diva_oper_inst_id)
  where diva_oper_inst_id is not null;
