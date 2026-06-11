-- =============================================================================
-- SecondaryDesk — EXIT 시나리오: 매물별 투자 라운드
-- =============================================================================
-- 매물(포트폴리오사)별 라운드 투자 데이터를 저장한다. EXIT 시나리오 화면의
-- 입력 소스이자 저장본 역할(매물 선택 시 불러오기 / 저장 시 덮어쓰기).
-- 라운드별: 투자액·투자 단가·보유 주식수. 할인율 프로젝션은 클라이언트 계산.
-- 재실행 안전(if not exists / drop ... if exists).
-- =============================================================================

create table if not exists public.exit_scenario_rounds (
  id          uuid primary key default gen_random_uuid(),
  listing_id  uuid not null references public.listings (id) on delete cascade,
  round_no    int  not null,                 -- 표시 순서(1,2,3 …). 최종 = 가장 큰 번호
  label       text,                           -- 라운드명(선택, 예: "Series A")
  amount      numeric not null default 0,     -- 투자액(원)
  unit_price  numeric not null default 0,     -- 투자 단가(원/주)
  shares      numeric not null default 0,     -- 보유 주식수
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table public.exit_scenario_rounds is 'EXIT 시나리오용 매물별 투자 라운드(투자액·단가·주식수)';

create index if not exists idx_exit_rounds_listing
  on public.exit_scenario_rounds (listing_id, round_no);

-- RLS: 다른 공용 자산과 동일하게 인증 팀 구성원 전체 허용
alter table public.exit_scenario_rounds enable row level security;

drop policy if exists exit_scenario_rounds_team_all on public.exit_scenario_rounds;
create policy exit_scenario_rounds_team_all on public.exit_scenario_rounds
  for all to authenticated using (true) with check (true);

-- updated_at 자동 갱신(기존 set_updated_at 재사용)
drop trigger if exists trg_exit_rounds_updated_at on public.exit_scenario_rounds;
create trigger trg_exit_rounds_updated_at
  before update on public.exit_scenario_rounds
  for each row execute function public.set_updated_at();
