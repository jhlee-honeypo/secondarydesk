-- =============================================================================
-- 매물 메모 — 실무자 코멘트 스레드 (재무 점검 탭의 "메모" 열)
-- =============================================================================
-- 분기보고 미제출 기업에 연락을 돌리며 남기는 진행 메모. 여러 유저가 동시에
-- 달 수 있어야 하므로 "한 매물당 텍스트 1칸"이 아니라 append-only 스레드로
-- 설계한다 — 각자 자기 행을 insert 하므로 동시 편집으로 남의 글이 덮이는
-- last-write-wins 손실이 원천적으로 없다. 수정은 지원하지 않고(삭제 후 재작성),
-- 삭제는 작성자 본인만 가능.
-- 재실행 안전(IF NOT EXISTS).

create table if not exists public.listing_memos (
  id         uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings (id) on delete cascade,
  body       text not null,
  author_id  uuid references public.users (id) on delete set null,
  created_at timestamptz not null default now()
);

-- 매물별 최신순 조회 + 개수 집계
create index if not exists listing_memos_listing_idx
  on public.listing_memos (listing_id, created_at desc);

-- RLS — 공용 자산: 인증된 팀 구성원이면 열람·작성 가능(다른 공용 테이블과 동일).
-- 단, 삭제는 작성자 본인만(남의 메모를 지우지 못하게). 수정은 정책 없음 = 불가.
alter table public.listing_memos enable row level security;

drop policy if exists listing_memos_select on public.listing_memos;
create policy listing_memos_select on public.listing_memos
  for select to authenticated using (true);

drop policy if exists listing_memos_insert on public.listing_memos;
create policy listing_memos_insert on public.listing_memos
  for insert to authenticated with check (author_id = auth.uid());

drop policy if exists listing_memos_delete on public.listing_memos;
create policy listing_memos_delete on public.listing_memos
  for delete to authenticated using (author_id = auth.uid());
