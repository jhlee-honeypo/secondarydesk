-- =============================================================================
-- SecondaryDesk — 딜 단계 변경 이력 (카드 내 미니 타임라인)
-- =============================================================================
-- 딜을 단계별로 옮길 때마다 "그 단계에 진입한 일시"를 1건씩 적재한다.
-- 드래그(updateDealStage)·수정 폼(updateDeal)·기타 코드 어떤 경로로 단계가
-- 바뀌어도 누락 없이 남도록, 앱 코드가 아닌 DB 트리거로 자동 기록한다.
-- 재실행 안전(if not exists / drop ... if exists).
-- =============================================================================

create table if not exists public.deal_stage_events (
  id          uuid primary key default gen_random_uuid(),
  deal_id     uuid not null references public.deals (id) on delete cascade,
  stage       deal_stage not null,
  changed_at  timestamptz not null default now(),
  changed_by  uuid references public.users (id)  -- 단계를 옮긴 사람(가능하면)
);

comment on table public.deal_stage_events is '딜 단계 진입 이력(카드 미니 타임라인)';

-- 딜별 시간순 조회용
create index if not exists idx_deal_stage_events_deal
  on public.deal_stage_events (deal_id, changed_at);

-- RLS: 다른 공용 자산과 동일하게 인증 팀 구성원 전체 허용
alter table public.deal_stage_events enable row level security;

drop policy if exists deal_stage_events_team_all on public.deal_stage_events;
create policy deal_stage_events_team_all on public.deal_stage_events
  for all to authenticated using (true) with check (true);

-- -----------------------------------------------------------------------------
-- 단계 진입 자동 기록 트리거
--   - INSERT: 딜 생성 시 최초 단계 1건
--   - UPDATE OF stage: 단계가 실제로 바뀐 경우에만 1건
--   changed_by 는 현재 세션 사용자(auth.uid()), 없으면 딜 담당자로 폴백.
-- -----------------------------------------------------------------------------
create or replace function public.record_deal_stage_event()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.deal_stage_events (deal_id, stage, changed_by)
    values (new.id, new.stage, coalesce(auth.uid(), new.owner_id));
  elsif tg_op = 'UPDATE' and new.stage is distinct from old.stage then
    insert into public.deal_stage_events (deal_id, stage, changed_by)
    values (new.id, new.stage, coalesce(auth.uid(), new.owner_id));
  end if;
  return new;
end;
$$;

drop trigger if exists trg_deal_stage_event on public.deals;
create trigger trg_deal_stage_event
  after insert or update of stage on public.deals
  for each row execute function public.record_deal_stage_event();

-- -----------------------------------------------------------------------------
-- 기존 딜 백필: 이력이 없는 딜은 생성 시점 기준으로 현재 단계 1건을 채운다.
--   (과거 단계 전환 데이터는 없으므로 베이스라인 1건만 — 이후 이동부터 누적)
-- -----------------------------------------------------------------------------
insert into public.deal_stage_events (deal_id, stage, changed_at, changed_by)
select d.id, d.stage, d.created_at, d.owner_id
from public.deals d
where not exists (
  select 1 from public.deal_stage_events e where e.deal_id = d.id
);
