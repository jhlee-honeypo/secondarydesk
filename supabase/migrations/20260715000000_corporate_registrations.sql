-- =============================================================================
-- 법인등기부등본 자동 추출 — 회사별 최신 등기 스냅샷
-- =============================================================================
-- slab 분기보고에 첨부된 법인등기부등본 PDF 를 Claude 로 추출한 값을 회사당 1행으로
-- 저장한다(회사별 '최신 등기부등본' 1건만 유지 — 재추출 시 upsert). 설립일·본점은
-- 사실상 불변이라 백필 1회로 충분하고, 본점 이전·발행주식 변경 시에만 갱신된다.
-- 발행주식은 종류 수가 가변(보통주/여러 종류 우선주)이라 shares_by_type(jsonb)로 담는다.
-- financial_statements 컨벤션(bubble_company_id·source_file_url·RLS 모델)을 그대로 따른다.
-- 재실행 안전(IF NOT EXISTS).

create table if not exists public.corporate_registrations (
  id                  uuid primary key default gen_random_uuid(),

  company_name        text not null,
  company_name_en     text,
  bubble_company_id   text unique,          -- slab(sparkERP) company._id (회사당 1행 · upsert 키)

  established_date    date,                 -- 설립등기일(회사성립연월일)
  head_office_address text,                 -- 현재 유효 본점 주소 전체(말소분 제외)
  head_office_city    text,                 -- 본점 광역시/도 (예: '서울특별시') — 지역 필터용
  issue_date          date,                 -- 등기부등본 발행/열람일시(문서 하단)

  -- '발행주식의 총수와 그 종류 및 각각의 수'의 현재 유효값
  total_issued_shares numeric,              -- 발행주식 총수
  shares_by_type      jsonb not null default '[]'::jsonb,  -- [{type,count}] 종류별
  shares_as_of_date   date,                 -- 위 발행주식 값이 반영된 변경등기일(신선도)

  source              text not null default 'slab',  -- 'slab' | 'upload'
  source_file         text,                 -- 원본 파일명
  source_file_url     text,                 -- slab CDN URL (출처 추적 · 재추출 무효화 키)

  created_by          uuid references public.users(id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists corporate_registrations_company_idx
  on public.corporate_registrations (lower(company_name));

create index if not exists corporate_registrations_city_idx
  on public.corporate_registrations (head_office_city)
  where head_office_city is not null;

-- updated_at 자동 갱신 (기존 공용 트리거 함수 재사용)
drop trigger if exists trg_corporate_registrations_updated_at on public.corporate_registrations;
create trigger trg_corporate_registrations_updated_at
  before update on public.corporate_registrations
  for each row execute function public.set_updated_at();

-- RLS — 공용 자산: 인증된 팀 구성원이면 전체 CRUD (financial_statements 와 동일 모델)
alter table public.corporate_registrations enable row level security;

drop policy if exists corporate_registrations_all on public.corporate_registrations;
create policy corporate_registrations_all on public.corporate_registrations
  for all to authenticated using (true) with check (true);
