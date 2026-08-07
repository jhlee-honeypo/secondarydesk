-- =============================================================================
-- 발행주식수 점검 — 조치 큐의 검토 상태 + 메모 (/share-audit)
-- =============================================================================
-- 조합별로 발행주식총수 불일치를 훑으며 "확인했다 / 조치 불필요다" 를 남기고,
-- 진행 상황을 메모로 쌓는다. slab-agent(팀원 레포)의 review_items 를 이식한 것이나
-- 두 가지를 바꿨다:
--
--  ① 키를 `fund|category|company` 가 아니라 **회사 단위(slab company._id)** 로 둔다.
--     발행주식총수는 회사 속성이라 같은 회사가 여러 조합에 속해도 이슈는 하나다.
--     원본은 펀드별로 행이 갈려 같은 건을 여러 번 확인해야 했고, 심각도가 바뀌면
--     키가 달라져 메모가 유실돼 나중에 마이그레이션으로 kind 를 떼야 했다.
--  ② 메모를 jsonb 배열이 아니라 **append-only 행**으로 쌓는다(listing_memos 와 동일).
--     여러 유저가 동시에 달아도 각자 자기 행을 insert 하므로 last-write-wins 로
--     남의 글이 사라지지 않는다.
--
-- 회사 키가 uuid 가 아니라 text 인 이유: slab(Bubble) _id 는 외부 시스템의
-- 문자열 id 다(예: 1741833795999x148028301158697800). FK 를 걸 대상 테이블이 없다.
-- 재실행 안전(IF NOT EXISTS).

-- 검토 상태 — 회사당 한 행. 행이 없으면 'open'(미확인)과 같다.
create table if not exists public.share_audit_reviews (
  company_id text primary key,
  status     text not null default 'open'
             check (status in ('open', 'ack', 'dismissed')),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.users (id) on delete set null
);

comment on table public.share_audit_reviews is
  '발행주식수 점검 조치 큐의 검토 상태(ack=확인함, dismissed=조치 불필요). 키=slab company._id';

-- 메모 — append-only 스레드
create table if not exists public.share_audit_memos (
  id         uuid primary key default gen_random_uuid(),
  company_id text not null,
  body       text not null,
  author_id  uuid references public.users (id) on delete set null,
  created_at timestamptz not null default now()
);

comment on table public.share_audit_memos is
  '발행주식수 점검 메모(append-only). 수정 불가, 삭제는 작성자 본인만';

create index if not exists share_audit_memos_company_idx
  on public.share_audit_memos (company_id, created_at desc);

-- RLS ------------------------------------------------------------------------
-- 검토 상태: 공용 운영 상태값. 남이 '확인함' 으로 둔 것을 되돌리는 것도 정상 업무라
-- (미팅 대상 핀 listing_meeting_targets 과 같은 이유) 작성자 제한을 두지 않는다.
alter table public.share_audit_reviews enable row level security;

drop policy if exists share_audit_reviews_team_all on public.share_audit_reviews;
create policy share_audit_reviews_team_all on public.share_audit_reviews
  for all to authenticated using (true) with check (true);

-- 메모: 열람·작성은 팀 전체, 삭제는 본인만. 수정 정책 없음 = 불가(삭제 후 재작성).
alter table public.share_audit_memos enable row level security;

drop policy if exists share_audit_memos_select on public.share_audit_memos;
create policy share_audit_memos_select on public.share_audit_memos
  for select to authenticated using (true);

drop policy if exists share_audit_memos_insert on public.share_audit_memos;
create policy share_audit_memos_insert on public.share_audit_memos
  for insert to authenticated with check (author_id = auth.uid());

drop policy if exists share_audit_memos_delete on public.share_audit_memos;
create policy share_audit_memos_delete on public.share_audit_memos
  for delete to authenticated using (author_id = auth.uid());
