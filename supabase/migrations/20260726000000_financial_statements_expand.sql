-- =============================================================================
-- 재무 점검 — 손익 구조 + 재무상태표 지표 확장 (slab-bot DB 확장 Phase 1)
-- =============================================================================
-- 기존 11개 값(매출·순이익 당/전기, 현금, 예금, 자본총계, 자본금, 판관비)에
-- 스타트업 분석 공통 필수 지표 7개를 추가한다. 파생 비율(매출총이익률·영업이익률·
-- 부채비율·유동비율)은 저장하지 않고 lib/financial-health.ts 에서 계산한다.
--
-- 기존 11개(not null default 0)와 달리 신규 컬럼은 nullable 로 둔다 — 그래야
-- 이미 저장된 행(재추출 전)이 NULL 로 남아 "0 실적"과 "아직 추출 안 됨"이 구분되고,
-- 백필이 NULL 행만 채우거나 재추출 대상을 식별할 수 있다.
-- 재실행 안전(IF NOT EXISTS).

alter table public.financial_statements
  add column if not exists cogs                 numeric,  -- 매출원가 (SW기업은 0 흔함 → 매출총이익=매출액)
  add column if not exists operating_income     numeric,  -- 영업이익(손실) — 실제 번(burn)의 실체
  add column if not exists current_assets       numeric,  -- 유동자산 (유동비율)
  add column if not exists current_liabilities  numeric,  -- 유동부채 (유동비율)
  add column if not exists total_assets         numeric,  -- 자산총계 (정합 자기검증)
  add column if not exists total_liabilities    numeric,  -- 부채총계 (부채비율)
  add column if not exists retained_earnings    numeric;  -- 이익잉여금(결손금) — 음수=결손 (부호 통일)
