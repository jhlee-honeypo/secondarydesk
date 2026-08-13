-- =============================================================================
-- 분기별 회수 전략 그룹 — 재무 점검 탭의 "그룹" 열 (A / B / C)
-- =============================================================================
-- 기업 상황을 보고 사람이 직접 판단해 찍는 값이다. 재무 지표에서 자동 도출하지
-- 않는다(자동 판정은 이미 health 배지가 한다 — 그 위에 사람 판단을 덧씌우는 열).
--
--   A = 즉시 회수 및 조기 배분 유력 자산
--   B = 전략적 회수 가치 극대화 자산
--   C = 리스크 관리 및 자산 효율화 자산
--
-- 분기별로 남긴다 — 같은 회사도 분기마다 판단이 바뀌고, 당 분기를 기입할 때
-- 이전 분기에 뭐라고 봤는지 나란히 보여야 하기 때문. 그래서 미팅 핀
-- (listing_meeting_targets, 분기 없는 단일 on/off)과 달리 (매물, 분기)가 PK다.
--
-- 단위는 매물(회사)이고 조합이 아니다. "기업 상황에 따른" 판단이라 어느 조합에서
-- 보든 같은 값이어야 한다. 조합별로 다르게 봐야 할 일이 생기면 그때 컬럼을 늘린다.
-- 기본값은 없다 — 행이 없으면 미기입(화면에서도 공란).
-- 재실행 안전(IF NOT EXISTS).

create table if not exists public.listing_quarter_groups (
  listing_id   uuid not null references public.listings (id) on delete cascade,
  report_year  int  not null,          -- 보고 연도 (예: 2026)
  report_month int  not null,          -- 보고월 3·6·9·12 (financial_statements 와 동일 기준)
  group_code   text not null,
  updated_at   timestamptz not null default now(),
  updated_by   uuid references public.users (id) on delete set null,

  primary key (listing_id, report_year, report_month),
  constraint listing_quarter_groups_month_check check (report_month in (3, 6, 9, 12)),
  constraint listing_quarter_groups_code_check check (group_code in ('A', 'B', 'C'))
);

comment on table public.listing_quarter_groups is
  '분기별 회수 전략 그룹(수기 판단) — A 즉시 회수·조기 배분 / B 전략적 가치 극대화 / C 리스크 관리';

-- 한 분기 전체를 훑는 조회(재무 점검 탭이 당 분기·이전 분기 두 벌을 한 번에 읽는다)
create index if not exists listing_quarter_groups_period_idx
  on public.listing_quarter_groups (report_year, report_month);

-- RLS — 공용 자산: 인증된 팀 구성원이면 열람·기입·수정·삭제 가능.
-- 미팅 핀과 같은 이유로 작성자 제한을 두지 않는다(남이 찍은 그룹을 다음 분기에
-- 다시 판단하는 게 정상 업무). 누가 마지막에 만졌는지만 updated_by 로 남긴다.
alter table public.listing_quarter_groups enable row level security;

drop policy if exists listing_quarter_groups_team_all on public.listing_quarter_groups;
create policy listing_quarter_groups_team_all on public.listing_quarter_groups
  for all to authenticated using (true) with check (true);
