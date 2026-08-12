-- =============================================================================
-- IR덱 자동 추출 — 회사별 최신 IR 자료 스냅샷
-- =============================================================================
-- slab 분기보고에 첨부된 IR덱 PDF 를 Claude 로 추출한 값을 회사당 1행으로 저장한다
-- (회사별 '최신 IR덱' 1건만 유지 — 재추출 시 upsert). corporate_registrations 의
-- 컨벤션(bubble_company_id·source_file_url·RLS 모델)을 그대로 따른다.
--
-- ── 왜 2계층인가 ─────────────────────────────────────────────────────────────
-- IR덱은 감사받은 자료가 아니라 마케팅 문서다. 그래서 추출값을 두 컬럼으로 쪼갠다.
--
--   context — "이 회사가 뭘 하는가". 사업 이해·횡단 검색에 그대로 노출해도 되는 층.
--   claims  — "회사가 이렇게 주장했다". 실적·시장규모·조달 등 수치.
--             ⛔ 단독으로 답변에 내보내지 말 것. financial_statements /
--                분기보고와 대조해 괴리를 드러내는 용도로만 쓴다.
--
-- 두 층을 한 jsonb 에 섞지 않고 컬럼으로 가르는 이유는, 조회하는 쪽이 실수로 섞어
-- 반환할 수 없게 만들기 위해서다. context 만 select 하면 주장 수치는 따라올 수 없다.
--
-- 실측 근거: 어느 덱은 "2023-03 사용자 1만 명"이라 적었는데 같은 회사 분기보고상
-- 2024-06 이 9,169명이었다(시간을 거스르는 수치). 또 다른 덱은 SOM(840조) > TAM(810조).
-- claims 를 확정 정보로 다루면 이런 값이 그대로 답변에 나간다.
--
-- 재실행 안전(IF NOT EXISTS).

create table if not exists public.ir_decks (
  id                  uuid primary key default gen_random_uuid(),

  company_name        text not null,
  company_name_en     text,
  bubble_company_id   text unique,          -- slab(sparkERP) company._id (회사당 1행 · upsert 키)

  -- 이 덱이 첨부됐던 분기보고 시점. 덱 내용의 신선도 판단 기준이며, 답변에 반드시
  -- 함께 표기해야 한다(사업 방향이 분기마다 바뀐 회사가 실제로 있다).
  deck_year           int,
  deck_quarter        text,                 -- '1분기' … '4분기'
  deck_date           text,                 -- 덱 자체에 적힌 날짜(YYYY / YYYY-MM / YYYY-MM-DD). 형식이 제각각이라 text.

  -- ── 1계층: 맥락 (답변 가능) ──
  -- {oneLiner, problem, solution, product, businessModel, targetCustomer,
  --  revenueStreams[], keyCustomers[], competitors[], moat, team[{name,role,background}]}
  context             jsonb not null default '{}'::jsonb,

  -- ── 2계층: 주장 (단독 노출 금지 · 대조 전용) ──
  -- {traction[{metric,value,asOf,kind}], market{tam,sam,som,basis},
  --  fundingAsk, useOfFunds, roadmap[{period,milestone}]}
  -- traction[].kind = 'actual'(덱이 달성했다고 제시) | 'projection'(목표·전망).
  -- 판단이 애매하면 추출 단계에서 projection 으로 떨어뜨린다.
  claims              jsonb not null default '{}'::jsonb,

  -- 덱이 스스로 밝힌 식별 정보 — corporate_registrations 와 대조용
  -- {establishedDate, ceo, businessRegNo, headOffice}
  company_facts       jsonb not null default '{}'::jsonb,

  deck_language       text,                 -- 'ko' | 'en' | 'mixed'
  -- 검토자가 알아야 할 것: 이 문서가 IR덱이 아니라 회사소개서라거나, 내부 수치가
  -- 서로 모순된다거나, 편집 중 코멘트가 남아 있다거나. 112곳 전부에 값이 있었다.
  notes               text,

  source              text not null default 'slab',  -- 'slab' | 'upload'
  source_file         text,                 -- 원본 파일명
  source_file_url     text,                 -- slab CDN URL (출처 추적 · 재추출 무효화 키)
  extracted_at        timestamptz not null default now(),
  extract_model       text,                 -- 추출에 쓴 모델(재추출 판단용)

  created_by          uuid references public.users(id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists ir_decks_company_idx
  on public.ir_decks (lower(company_name));

create index if not exists ir_decks_deck_period_idx
  on public.ir_decks (deck_year desc, deck_quarter desc);

-- 횡단 검색("건설 AI 하는 포트폴리오 뽑아줘")은 1계층만 대상으로 한다.
-- claims 를 인덱스에 넣지 않는 것 자체가 방어선 — 주장 수치는 검색으로도 새지 않는다.
-- jsonb_to_tsvector 는 IMMUTABLE 이고 '["string"]' 지정 시 JSON 키·구조는 빼고
-- 문자열 값만 담는다(context::text 캐스팅은 인덱스 표현식에서 거부될 수 있다).
create index if not exists ir_decks_context_fts_idx
  on public.ir_decks
  using gin (jsonb_to_tsvector('simple', context, '["string"]'));

-- 경쟁사·고객사 배열 조회("리디를 고객사로 적은 회사")
create index if not exists ir_decks_context_gin_idx
  on public.ir_decks using gin (context jsonb_path_ops);

-- updated_at 자동 갱신 (기존 공용 트리거 함수 재사용)
drop trigger if exists trg_ir_decks_updated_at on public.ir_decks;
create trigger trg_ir_decks_updated_at
  before update on public.ir_decks
  for each row execute function public.set_updated_at();

-- RLS — 공용 자산: 인증된 팀 구성원이면 전체 CRUD (corporate_registrations 와 동일 모델)
alter table public.ir_decks enable row level security;

drop policy if exists ir_decks_all on public.ir_decks;
create policy ir_decks_all on public.ir_decks
  for all to authenticated using (true) with check (true);

comment on column public.ir_decks.context is
  '1계층 — 사업 맥락. 답변에 그대로 노출 가능(단, 덱 시점 표기 필수).';
comment on column public.ir_decks.claims is
  '2계층 — 회사 자체 주장 수치. 단독 노출 금지. financial_statements/분기보고와 대조해서만 사용.';
