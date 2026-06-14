-- =============================================================================
-- SecondaryDesk — funds.diva_asct_id (DIVA 조합ID) 추가
-- =============================================================================
-- DIVA(벤처캐피탈협회 전자공시) 조합 임포트의 멱등 키. 각 조합은 DIVA에서
-- ASCT_ID(예: AS20230619)로 고유 식별되며, 이 값으로 재임포트 시 중복 없이
-- 갱신한다. 공동운용(co-GP) 조합은 운용사별로 같은 ASCT_ID를 가질 수 있으므로
-- (investor_id, diva_asct_id) 단위로 유일하게 둔다.
-- 적용: Supabase 대시보드 > SQL Editor 에 붙여넣고 실행. (재실행 안전)
-- =============================================================================

alter table public.funds
  add column if not exists diva_asct_id text;

create unique index if not exists uq_funds_investor_diva_asct
  on public.funds (investor_id, diva_asct_id)
  where diva_asct_id is not null;
