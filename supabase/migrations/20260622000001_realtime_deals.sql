-- =============================================================================
-- SecondaryDesk — 딜 보드 실시간 동기화(Realtime publication)
-- =============================================================================
-- 공동작업 시 한 팀원의 카드 이동·딜 생성/삭제가 다른 팀원 화면에 즉시 반영되도록
-- deals / deal_stage_events 를 Supabase Realtime publication 에 추가한다.
-- 클라이언트(deal-board)는 이 테이블의 변경을 구독해 보드를 새로고침한다.
-- 적용: Supabase 대시보드 > SQL Editor 에 붙여넣고 실행. (재실행 안전)
-- =============================================================================

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public' and tablename = 'deals'
  ) then
    alter publication supabase_realtime add table public.deals;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public' and tablename = 'deal_stage_events'
  ) then
    alter publication supabase_realtime add table public.deal_stage_events;
  end if;
end $$;
