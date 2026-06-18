-- =============================================================================
-- 재무 점검 — 재무제표 자동 추출/판정 (새 탭 "재무 점검")
-- =============================================================================
-- 한국 재무제표 PDF/이미지를 Claude 로 추출한 11개 값을 분기별 시계열로 저장한다.
-- 한 행 = (회사, 연도, 보고월) 한 분기. report_month 는 3/6/9/12 누적월이며
-- 동시에 월평균 계산의 분모(달)로 쓰인다. 파생 지표(보유현금·런웨이·자본잠식률)는
-- 저장하지 않고 읽을 때 lib/financial-health.ts 에서 계산한다.
-- 재실행 안전(IF NOT EXISTS).

create table if not exists public.financial_statements (
  id                uuid primary key default gen_random_uuid(),

  company_name      text not null,
  company_name_en   text,
  bubble_company_id text,                 -- slab(sparkERP) company._id (출처 연결용)

  report_year       int  not null,        -- 보고 연도 (예: 2025)
  report_month      int  not null,        -- 보고월/누적월 3·6·9·12 (= 월평균 분모)

  rev_curr          numeric not null default 0,  -- 매출(당기)
  ni_curr           numeric not null default 0,  -- 당기순이익(당기)
  rev_prev          numeric not null default 0,  -- 매출(전기)
  ni_prev           numeric not null default 0,  -- 당기순이익(전기)
  cash              numeric not null default 0,  -- 현금및현금성자산
  savings           numeric not null default 0,  -- 보통예금(별도 표기 시)
  total_equity      numeric not null default 0,  -- 자본총계
  capital           numeric not null default 0,  -- 자본금
  sga               numeric not null default 0,  -- 판매비와관리비

  source            text not null default 'upload',  -- 'upload' | 'slab'
  source_file       text,                 -- 원본 파일명
  source_file_url   text,                 -- slab CDN URL (출처 추적)

  created_by        uuid references public.users(id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  -- 회사·분기당 1행 (재추출 시 upsert)
  constraint financial_statements_period_key
    unique (company_name, report_year, report_month)
);

create index if not exists financial_statements_company_idx
  on public.financial_statements (lower(company_name));

create index if not exists financial_statements_bubble_idx
  on public.financial_statements (bubble_company_id)
  where bubble_company_id is not null;

-- updated_at 자동 갱신 (기존 공용 트리거 함수 재사용)
drop trigger if exists trg_financial_statements_updated_at on public.financial_statements;
create trigger trg_financial_statements_updated_at
  before update on public.financial_statements
  for each row execute function public.set_updated_at();

-- RLS — 공용 자산: 인증된 팀 구성원이면 전체 CRUD (다른 공용 테이블과 동일 모델)
alter table public.financial_statements enable row level security;

drop policy if exists financial_statements_all on public.financial_statements;
create policy financial_statements_all on public.financial_statements
  for all to authenticated using (true) with check (true);
