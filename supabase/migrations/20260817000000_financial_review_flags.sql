-- =============================================================================
-- 추출값 확인 필요 표시 — 재무 점검 탭의 "확인" 열
-- =============================================================================
-- 기업이 분기보고에 엉뚱한 재무제표를 올려(다른 회사·다른 기간·일부 페이지 누락)
-- 추출값이 틀렸는데, 파일을 바로 다시 받기 어려운 경우가 있다. 그런 행을 표시해
-- 두고 나중에 한 번에 모아 보며 고치기 위한 운영 상태값이다.
--
-- 붙는 단위는 (매물, 분기)가 아니라 저장된 재무 행 그 자체(financial_statements.id)다.
-- 재무 점검 표의 머리글 분기(조합의 최신 분기)와 각 회사에 실제로 매칭된 재무 행의
-- 분기가 다를 수 있어, "지금 화면에 보이는 이 숫자들이 틀렸다" 를 정확히 가리키려면
-- 행을 직접 참조해야 한다. 재추출·재저장은 같은 키(회사·연도·분기) upsert 라
-- id 가 유지되므로 표시도 그대로 남는다. 행을 지우면 표시도 함께 사라진다(cascade).
--
-- ⚠️ listing_meeting_targets(미팅 핀)와 별개다. 미팅 핀은 "재무를 보고 이 팀을
-- 만나야 한다" 는 회사 단위 To-Do 이고, 이 표는 "이 분기 추출값 자체가 틀렸으니
-- 데이터를 고쳐야 한다" 는 데이터 품질 표시다. 서로 섞지 않는다.
--
-- note = 무엇이 잘못됐는지 한 줄(선택). 몇 주 뒤 모아 고칠 때 원본을 다시 열어
-- 보지 않고도 어디를 볼지 알 수 있게 남긴다.
-- 재실행 안전(IF NOT EXISTS).

create table if not exists public.financial_review_flags (
  statement_id uuid primary key
    references public.financial_statements (id) on delete cascade,
  note         text,
  updated_at   timestamptz not null default now(),
  updated_by   uuid references public.users (id) on delete set null
);

comment on table public.financial_review_flags is
  '추출값 확인 필요 표시(재무 점검 탭). 행 존재 = 재무제표 오업로드 등으로 추출값 교정 필요';

-- RLS — 공용 자산: 인증된 팀 구성원이면 열람·표시·해제 가능.
-- 미팅 핀·회수 전략 그룹과 같은 이유로 작성자 제한을 두지 않는다(남이 표시한 걸
-- 고친 뒤 해제하는 게 정상 업무). 누가 마지막에 만졌는지만 updated_by 로 남긴다.
alter table public.financial_review_flags enable row level security;

drop policy if exists financial_review_flags_team_all on public.financial_review_flags;
create policy financial_review_flags_team_all on public.financial_review_flags
  for all to authenticated using (true) with check (true);
