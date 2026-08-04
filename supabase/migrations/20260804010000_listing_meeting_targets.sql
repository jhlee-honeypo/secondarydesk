-- =============================================================================
-- 미팅 대상 표시 — 재무 점검 탭의 핀 (메모 열 오른쪽)
-- =============================================================================
-- 분기보고를 받아 재무 요약을 훑다가 "이 팀은 미팅해야 한다" 고 판단한 기업을
-- 골라 두는 운영 상태값. 행이 있으면 대상, 없으면 아님(listing_id 가 PK 라
-- 중복이 생기지 않아 토글이 곧 insert/delete).
--
-- 분기별로 나누지 않는다 — 지금 누구를 만나야 하는지가 알고 싶은 값이고,
-- 미팅이 끝나면 해제하는 To-Do 성격이라 이력 보관 대상이 아니다. 팀 공용이라
-- 누가 지정했는지만 남긴다(created_by).
--
-- ⚠️ listing_memos 와 별개다. 메모는 "분기보고 리마인드 메일을 언제 보냈는지"
-- 같은 실무 기록을 쌓는 append-only 스레드이고, 이 표는 "재무를 보고 미팅이
-- 필요하다고 판단했는지" 하나의 on/off 상태다. 서로 섞지 않는다.
-- 재실행 안전(IF NOT EXISTS).

create table if not exists public.listing_meeting_targets (
  listing_id uuid primary key references public.listings (id) on delete cascade,
  created_at timestamptz not null default now(),
  created_by uuid references public.users (id) on delete set null
);

comment on table public.listing_meeting_targets is
  '미팅이 필요하다고 표시한 매물(재무 점검 탭 핀). 행 존재 = 미팅 대상';

-- RLS — 공용 자산: 인증된 팀 구성원이면 열람·지정·해제 가능.
-- 메모와 달리 "남이 지정한 것"을 해제하는 게 정상 업무(미팅 완료 처리)라
-- 작성자 제한을 두지 않는다.
alter table public.listing_meeting_targets enable row level security;

drop policy if exists listing_meeting_targets_team_all on public.listing_meeting_targets;
create policy listing_meeting_targets_team_all on public.listing_meeting_targets
  for all to authenticated using (true) with check (true);
