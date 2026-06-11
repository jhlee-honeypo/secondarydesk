-- =============================================================================
-- SecondaryDesk — EXIT 시나리오 라운드에 소속 운용펀드 연결
-- =============================================================================
-- 한 매물이 2개 이상 운용펀드로 투자된 경우, 라운드별로 소속 펀드를 기재해
-- EXIT 시나리오 결과를 펀드별로 매칭/필터할 수 있게 한다. (단일 펀드 매물은
-- 입력 시 그 펀드를 기본값으로 사용 — 앱 로직) NULL 허용(미지정).
-- 재실행 안전(if not exists).
-- =============================================================================

alter table public.exit_scenario_rounds
  add column if not exists holding_fund_id uuid
    references public.holding_funds (id) on delete set null;

comment on column public.exit_scenario_rounds.holding_fund_id is
  'EXIT 라운드의 소속 운용펀드(펀드별 결과 매칭용, NULL=미지정)';

create index if not exists idx_exit_rounds_fund
  on public.exit_scenario_rounds (holding_fund_id);
