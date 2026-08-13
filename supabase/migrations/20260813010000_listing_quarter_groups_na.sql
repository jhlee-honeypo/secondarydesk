-- =============================================================================
-- 회수 전략 그룹에 '-'(해당 없음) 추가 — 20260813000000 의 check 제약 확장
-- =============================================================================
-- EXIT·상각(W/O)한 기업은 A/B/C 어디에도 넣을 게 아니지만, 공란으로 두면
-- "아직 안 봤음(미기입)"과 구분이 안 된다. 그래서 "봤고, 판단 대상이 아님"을
-- 뜻하는 '-' 를 네 번째 값으로 둔다.
-- 재실행 안전(drop → add).

alter table public.listing_quarter_groups
  drop constraint if exists listing_quarter_groups_code_check;

alter table public.listing_quarter_groups
  add constraint listing_quarter_groups_code_check
  check (group_code in ('A', 'B', 'C', '-'));

comment on table public.listing_quarter_groups is
  '분기별 회수 전략 그룹(수기 판단) — A 즉시 회수·조기 배분 / B 전략적 가치 극대화 / C 리스크 관리 / - 해당 없음(EXIT·상각)';
