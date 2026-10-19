-- =============================================================================
-- 서류실사 — 파일 없이 '응답'한 항목 (해당 없음 진술 · 설립 후 제출 예정)
-- =============================================================================
-- 기업은 제출 포털(SparkClaw)에서 16개 요청 항목에 **파일 또는 사유 텍스트**로
-- 응답한다. 그런데 /dd 1단계는 파일만 세고 있었다 — 그래서 "타법인 겸직 없음",
-- "기존 투자 없음" 처럼 파일이 존재할 수 없는 항목에 응답한 기업까지 전부
-- '미제출 → 완결성 탈락'으로 떨어졌다(배치 SparkClaw #1 의 17곳 전원 fail).
--
-- 포털의 항목 상태는 6종이고, 그중 파일이 없는 두 가지를 여기 담는다:
--
--   none_applicable  '해당 없음 진술' — 사유를 적어 응답한 것. 응답으로는
--                    인정하되 **서류로 검증된 것은 아니다**. 2단계 리스크
--                    판정에서는 자기확약 가드가 걸려 level='none' 으로
--                    올라가지 못한다(dd-screen.ts RISK_SYSTEM).
--   deferred         '설립 후 제출 예정' — 법인 미설립이라 지금은 발급 자체가
--                    불가능한 서류(등기부·정관·자본금). 포털도 이 항목을 필수
--                    분모에서 빼고 센다(치즈랩 10/10, 프리프 2/11). 누락과
--                    구별하지 않으면 설립 준비 중인 기업이 전부 탈락한다.
--
-- 나머지 4종은 여기 담지 않는다 — '접수됨'·'첨부됨'은 dd_files 가 이미 담고,
-- '해당 시 제출'(조건부 미응답)과 '준비 필요'(필수 미응답)는 레코드가 없는
-- 상태 그 자체다.
--
-- 재실행 안전(IF NOT EXISTS).

create table if not exists public.dd_declarations (
  id         uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.dd_companies (id) on delete cascade,
  -- dd_criteria.code 를 text 로 들고 있다(dd_files.criterion_code 와 같은 이유 —
  -- 기준 항목을 지웠다 되살려도 응답이 그대로 붙는다).
  criterion_code text not null,
  kind       text not null check (kind in ('none_applicable', 'deferred')),
  -- 기업이 적어 낸 사유 원문. deferred 는 비어 있을 수 있다(설립 예정일 안내만
  -- 뜨는 경우). none_applicable 은 사유가 핵심 자료라 비면 안 된다 — 애플리케이션
  -- 에서 막는다(제약으로 걸면 deferred 와 분기가 필요해 더 복잡해진다).
  reason     text not null default '',
  -- 포털 화면을 보고 사람이 옮겨 적었는지, 나중에 연동으로 들어왔는지 구분.
  source     text not null default 'manual',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.users (id) on delete set null,
  -- 한 항목에 응답은 하나다. 파일과 진술이 함께 있으면 파일이 이긴다(완결성 로직).
  unique (company_id, criterion_code)
);

comment on table public.dd_declarations is
  '파일 없이 응답한 서류 항목. none_applicable=해당 없음 진술(자기확약), deferred=법인 설립 후 제출 예정(필수 분모에서 제외)';
comment on column public.dd_declarations.reason is
  '기업이 적어 낸 사유 원문. 리스크 판정에 자기확약으로 넣는다 — 다른 서류와 모순되면 그 자체가 high 리스크';

create index if not exists dd_declarations_company_idx
  on public.dd_declarations (company_id);

-- RLS — 팀 공용(다른 dd_* 테이블과 동일 판단, 마이그레이션 §7 참조)
alter table public.dd_declarations enable row level security;
drop policy if exists dd_declarations_team_all on public.dd_declarations;
create policy dd_declarations_team_all on public.dd_declarations
  for all to authenticated using (true) with check (true);
