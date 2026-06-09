-- =============================================================================
-- SecondaryDesk — 소개 네트워크(F8): deals.intro_path 를 구조화 필드로 보강
-- =============================================================================
-- 추가 컬럼(모두 선택값):
--   intro_source       text  소개자(누가 연결했나)
--   intro_relationship text  관계(어떤 사이로)
--   intro_date         date  소개 일자
-- 기존 intro_path(자유서술)는 유지(보조 메모). 적용: SQL Editor 에서 실행(재실행 안전).
-- =============================================================================

alter table public.deals add column if not exists intro_source       text;
alter table public.deals add column if not exists intro_relationship text;
alter table public.deals add column if not exists intro_date         date;
