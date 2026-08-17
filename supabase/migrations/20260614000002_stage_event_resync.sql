-- =============================================================================
-- SecondaryDesk — 단계 이력 삭제 시 현존 단계로 자동 동기화
-- =============================================================================
-- 딜 수정 폼의 "단계 이력"에서 잘못 쌓인 이력 1건을 삭제하면, 딜의 현재 단계를
-- "남은 이력 중 가장 최근 단계"로 자동으로 되돌린다(예: 기업소개→IR 이동 후 IR
-- 이력을 지우면 카드가 기업소개로 내려옴).
--
-- deals.stage 를 바꾸면 record_deal_stage_event 트리거가 새 이력을 또 만들기
-- 때문에, 이 동기화 update 동안에는 세션 가드(app.suppress_stage_event='on')로
-- 트리거의 이력 생성을 건너뛴다. 가드는 트랜잭션이 같아야 보이므로 한 RPC 함수
-- 안에서 set local 로 설정한다(supabase-js 의 개별 호출은 커넥션이 달라 부적합).
--
-- 재실행 안전(create or replace).
-- =============================================================================

-- 트리거 함수: 가드가 켜져 있으면 이력 생성을 건너뛴다(나머지는 기존과 동일).
create or replace function public.record_deal_stage_event()
returns trigger
language plpgsql
as $$
begin
  if coalesce(current_setting('app.suppress_stage_event', true), '') = 'on' then
    return new;
  end if;

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

-- 이벤트 1건 삭제 + 남은 이력의 최신 단계로 딜 단계 동기화(새 이력 추가 없이).
--   - 이미 없는 이벤트면 아무 것도 하지 않음.
--   - 남은 이력이 없으면 딜 단계는 그대로 둔다(마지막 1건까지 지우는 경우 보호).
--   - security invoker — 호출자(인증 사용자) 권한·RLS 그대로 적용.
create or replace function public.delete_stage_event_resync(p_event_id uuid)
returns void
language plpgsql
security invoker
as $$
declare
  v_deal_id uuid;
  v_target  public.deal_stage;
begin
  select deal_id into v_deal_id
  from public.deal_stage_events
  where id = p_event_id;

  if v_deal_id is null then
    return;
  end if;

  delete from public.deal_stage_events where id = p_event_id;

  select stage into v_target
  from public.deal_stage_events
  where deal_id = v_deal_id
  order by changed_at desc, id desc
  limit 1;

  if v_target is not null then
    set local app.suppress_stage_event = 'on';
    update public.deals
    set stage = v_target
    where id = v_deal_id and stage is distinct from v_target;
  end if;
end;
$$;

-- PostgREST(supabase.rpc)로 인증 사용자가 호출할 수 있도록 명시적 grant.
grant execute on function public.delete_stage_event_resync(uuid) to authenticated;

-- 이벤트 1건 수정(단계/일자) + 남은 이력의 최신 단계로 딜 단계 동기화.
--   - 단계나 일자를 바꾸면 "가장 최근 이력"이 달라질 수 있으므로 매번 재동기화.
--   - 전달되지 않은 인자는 기존 값을 유지(coalesce). 트리거는 가드로 건너뜀.
create or replace function public.update_stage_event_resync(
  p_event_id   uuid,
  p_stage      public.deal_stage default null,
  p_changed_at timestamptz default null
)
returns void
language plpgsql
security invoker
as $$
declare
  v_deal_id uuid;
  v_target  public.deal_stage;
begin
  update public.deal_stage_events
  set stage      = coalesce(p_stage, stage),
      changed_at = coalesce(p_changed_at, changed_at)
  where id = p_event_id
  returning deal_id into v_deal_id;

  if v_deal_id is null then
    return;
  end if;

  select stage into v_target
  from public.deal_stage_events
  where deal_id = v_deal_id
  order by changed_at desc, id desc
  limit 1;

  if v_target is not null then
    set local app.suppress_stage_event = 'on';
    update public.deals
    set stage = v_target
    where id = v_deal_id and stage is distinct from v_target;
  end if;
end;
$$;

grant execute on function public.update_stage_event_resync(uuid, public.deal_stage, timestamptz)
  to authenticated;
