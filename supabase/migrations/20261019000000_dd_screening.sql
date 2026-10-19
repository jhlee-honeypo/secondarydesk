-- =============================================================================
-- 서류실사 스크리닝 (/dd) — 배치 기수 투심 대상 추리기
-- =============================================================================
-- 투심 전에 배치 기수 지원 기업의 제출 서류를 AI 로 훑어 통과/보류/탈락으로
-- 가른다. 2단계다 —
--
--   1단계 완결성 : 체크리스트 필수 서류가 다 있고 유효한가. **AI 콜 없이 코드로**
--                  판정한다(분류 단계에서 뽑아 둔 발급일·판독가능 여부로 산술).
--                  AI 에 "서류가 다 있니" 를 묻는 건 세는 일을 모델에 맡기는 것이라
--                  재현성이 없다.
--   2단계 리스크 : 1단계를 통과한 기업만, 서류 내용에서 투자 걸림돌을 찾는다.
--                  여기만 AI 판정이다.
--
-- 기존 기능들과의 관계: 이 테이블군은 slab(Bubble)·세컨더리 매물과 **연결하지
-- 않는다**. 배치 지원 기업은 아직 우리 포트폴리오가 아니라 slab 에 레코드가 없고,
-- 기업명만 가지고 시작하는 작업이다(사용자 확인). 투자가 집행되면 그때 slab 에
-- 생기므로, 나중에 이어 붙일 자리로 dd_companies.bubble_company_id 만 비워 둔다.
--
-- 재실행 안전(IF NOT EXISTS).

create extension if not exists pgcrypto;

-- -----------------------------------------------------------------------------
-- 1. 배치 기수
-- -----------------------------------------------------------------------------
create table if not exists public.dd_batches (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  note       text not null default '',
  created_at timestamptz not null default now(),
  created_by uuid references public.users (id) on delete set null
);

comment on table public.dd_batches is
  '서류실사 배치(기수). 예: "KF4 2026 상반기 배치". 기준·기업·판정이 모두 이 단위로 묶인다';

-- -----------------------------------------------------------------------------
-- 2. 평가 기준 — 배치별 '복사본'
-- -----------------------------------------------------------------------------
-- 전역 마스터 테이블 한 벌을 모두가 참조하면, 다음 배치에서 기준을 손본 순간
-- 지난 배치의 판정 근거가 소급해서 바뀐다(판정 결과는 남는데 "무슨 기준으로
-- 걸렀는지" 가 달라져 투심 방어가 불가능해진다). 그래서 배치를 만들 때 기본값을
-- 복사해 넣고, 편집은 그 배치 사본만 건드린다. 기본값은 코드 상수
-- (src/lib/dd-defaults.ts)에 둔다 — 마이그레이션에 시드하면 기본값을 고칠 때마다
-- 마이그레이션이 늘어난다.
create table if not exists public.dd_criteria (
  id         uuid primary key default gen_random_uuid(),
  batch_id   uuid not null references public.dd_batches (id) on delete cascade,
  kind       text not null check (kind in ('doc', 'risk')),
  code       text not null,
  label      text not null,
  -- doc  : 어떤 서류인지 AI 가 알아보도록 돕는 설명(동의어·양식명·발급기관)
  -- risk : 무엇을 걸림돌로 볼지 판정 가이드
  guidance   text not null default '',
  -- doc 에서만 의미 있음. 필수인데 없으면 완결성 미충족.
  required   boolean not null default true,
  -- doc 에서만 의미 있음. 발급 후 N일이 지나면 '만료'로 본다(납세증명 등).
  -- 0 = 신선도 무관(정관·주주간계약처럼 발급일 개념이 없는 서류).
  max_age_days integer not null default 0 check (max_age_days >= 0),
  sort_order integer not null default 0,
  unique (batch_id, kind, code)
);

comment on table public.dd_criteria is
  '배치별 평가 기준 사본. kind=doc(서류 체크리스트) / risk(리스크 판정 항목)';

create index if not exists dd_criteria_batch_idx
  on public.dd_criteria (batch_id, kind, sort_order);

-- -----------------------------------------------------------------------------
-- 3. 대상 기업
-- -----------------------------------------------------------------------------
create table if not exists public.dd_companies (
  id         uuid primary key default gen_random_uuid(),
  batch_id   uuid not null references public.dd_batches (id) on delete cascade,
  name       text not null,
  note       text not null default '',
  -- 투자 집행 후 slab 에 레코드가 생기면 그때 채운다. 지금은 항상 null.
  bubble_company_id text,
  created_at timestamptz not null default now(),
  created_by uuid references public.users (id) on delete set null,
  unique (batch_id, name)
);

comment on table public.dd_companies is
  '배치 기수의 실사 대상 기업. 기업명만으로 시작한다(지원서 export 불필요)';

create index if not exists dd_companies_batch_idx
  on public.dd_companies (batch_id, name);

-- -----------------------------------------------------------------------------
-- 4. 제출 파일
-- -----------------------------------------------------------------------------
-- 파일은 Storage(dd-docs 버킷)에 두고 여기엔 메타데이터 + AI 분류 결과를 쌓는다.
--
-- criterion_code 를 FK(criterion_id) 가 아니라 **text 코드**로 들고 있는 이유:
-- 기준 항목을 지웠다 되살리는 편집이 일상인데 FK + on delete 로는 분류 결과가
-- 같이 날아간다. 코드로 느슨하게 묶으면 항목이 사라져도 "이 파일은 납세증명으로
-- 분류됐었다" 가 남아 되살렸을 때 그대로 붙는다.
create table if not exists public.dd_files (
  id           uuid primary key default gen_random_uuid(),
  company_id   uuid not null references public.dd_companies (id) on delete cascade,
  storage_path text not null unique,
  file_name    text not null,
  mime_type    text not null default '',
  byte_size    bigint not null default 0,

  -- ── AI 분류 결과 (classifyDocument) ──────────────────────────────────────
  -- null = 아직 분류 안 함. '' = 분류 시도했으나 어느 항목에도 해당 없음.
  criterion_code text,
  -- 모델이 읽어낸 문서 제목·발급일·기준일·문서상 회사명. 완결성 판정과
  -- "엉뚱한 회사 서류가 섞였다" 감지에 쓴다.
  doc_title    text not null default '',
  issued_date  date,
  as_of_date   date,
  doc_company  text not null default '',
  -- 'high' | 'medium' | 'low' — low 는 화면에서 사람 확인을 띄운다.
  confidence   text not null default '' check (confidence in ('', 'high', 'medium', 'low')),
  -- Claude 가 내용을 실제로 읽었는가. xlsx/hwp/docx 등은 false → 사람 확인 대상.
  readable     boolean not null default true,
  classify_note text not null default '',
  classified_at timestamptz,

  -- 사람이 AI 분류를 고쳤으면 그 코드. 판정은 override 를 우선한다.
  override_code text,
  override_by   uuid references public.users (id) on delete set null,
  override_at   timestamptz,

  uploaded_at  timestamptz not null default now(),
  uploaded_by  uuid references public.users (id) on delete set null
);

comment on table public.dd_files is
  '실사 제출 파일 메타 + AI 분류 결과. 실제 파일은 Storage dd-docs 버킷';
comment on column public.dd_files.override_code is
  '사람이 고친 분류 코드. 판정 시 criterion_code 보다 우선한다';

create index if not exists dd_files_company_idx
  on public.dd_files (company_id, uploaded_at);

-- -----------------------------------------------------------------------------
-- 5. 판정 결과
-- -----------------------------------------------------------------------------
-- 기업 × 단계당 최신 1행(재실행하면 덮어쓴다). 이력을 쌓지 않는 이유는 이 표가
-- "이번 투심에 올릴 명단" 이고, 기준을 고쳐 다시 돌리면 이전 판정은 효력이 없기
-- 때문이다. 근거는 details 에 통째로 남으므로 왜 그렇게 갈렸는지는 추적된다.
create table if not exists public.dd_assessments (
  company_id uuid not null references public.dd_companies (id) on delete cascade,
  stage      text not null check (stage in ('completeness', 'risk')),
  verdict    text not null check (verdict in ('pass', 'hold', 'fail')),
  summary    text not null default '',
  -- completeness: {items:[{code,label,status,fileId,reason}], missing:[], stale:[], unreadable:[]}
  -- risk        : {items:[{code,label,level,finding,evidence}], ...}
  details    jsonb not null default '{}'::jsonb,
  model      text not null default '',
  created_at timestamptz not null default now(),
  created_by uuid references public.users (id) on delete set null,
  primary key (company_id, stage)
);

comment on table public.dd_assessments is
  '단계별 최신 판정. stage=completeness(코드 판정) / risk(AI 판정)';

-- -----------------------------------------------------------------------------
-- 6. 사람 결정 — AI 판정을 덮는 최종값
-- -----------------------------------------------------------------------------
-- AI 결과를 그대로 투심에 올리지 않는다. 심사역이 뒤집은 건과 그 사유를 따로
-- 남겨야 "AI 가 탈락시켰는데 우리가 올렸다" 를 설명할 수 있다.
create table if not exists public.dd_decisions (
  company_id uuid primary key references public.dd_companies (id) on delete cascade,
  verdict    text not null check (verdict in ('pass', 'hold', 'fail')),
  reason     text not null default '',
  updated_at timestamptz not null default now(),
  updated_by uuid references public.users (id) on delete set null
);

comment on table public.dd_decisions is
  '사람이 확정한 최종 판정. 행이 있으면 AI 판정보다 우선한다';

-- -----------------------------------------------------------------------------
-- 7. RLS — 팀 공용 운영 데이터
-- -----------------------------------------------------------------------------
-- share_audit_reviews 와 같은 판단: 남이 올린 서류를 지우거나 남의 판정을
-- 되돌리는 것도 정상 업무(실사는 팀 작업)라 작성자 제한을 두지 않는다.
-- 승인 대기(approved=false) 사용자는 (app) 레이아웃에서 /pending 으로 막힌다.
do $$
declare t text;
begin
  foreach t in array array[
    'dd_batches', 'dd_criteria', 'dd_companies',
    'dd_files', 'dd_assessments', 'dd_decisions'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_team_all', t);
    execute format(
      'create policy %I on public.%I for all to authenticated using (true) with check (true)',
      t || '_team_all', t);
  end loop;
end $$;

-- -----------------------------------------------------------------------------
-- 8. Storage 버킷 — 비공개
-- -----------------------------------------------------------------------------
-- 납세증명·주주명부·주주간계약이 들어오는 버킷이다. public 이면 URL 을 아는
-- 누구나 열 수 있으므로 반드시 비공개 + 서명 URL 로만 열람한다.
-- 경로 규약: {batch_id}/{company_id}/{uuid}-{파일명}
insert into storage.buckets (id, name, public, file_size_limit)
values ('dd-docs', 'dd-docs', false, 52428800)  -- 50MB/파일
on conflict (id) do nothing;

-- 업로드는 브라우저에서 Storage 로 직접 올린다(서버 액션 본문 크기 제한을 피하고
-- 큰 PDF 를 서버 메모리로 통과시키지 않기 위해). 그래서 authenticated 롤에
-- 정책이 필요하다. 읽기는 서버가 service_role 로 서명 URL 을 만들지만,
-- 클라이언트 업로드 후 검증 조회를 위해 select 도 열어 둔다.
do $$
declare p text;
begin
  foreach p in array array[
    'dd_docs_select', 'dd_docs_insert', 'dd_docs_update', 'dd_docs_delete'
  ] loop
    execute format('drop policy if exists %I on storage.objects', p);
  end loop;
end $$;

create policy dd_docs_select on storage.objects
  for select to authenticated using (bucket_id = 'dd-docs');

create policy dd_docs_insert on storage.objects
  for insert to authenticated with check (bucket_id = 'dd-docs');

create policy dd_docs_update on storage.objects
  for update to authenticated using (bucket_id = 'dd-docs');

create policy dd_docs_delete on storage.objects
  for delete to authenticated using (bucket_id = 'dd-docs');
