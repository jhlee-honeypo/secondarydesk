-- =============================================================================
-- 재무 점검 — slab 분기보고 정성 정보 영구 저장 (투자유치·직원 수·비즈니스 하이라이트)
-- =============================================================================
-- 기존엔 추출 검토 단계에서만 참고로 보여주던 slab 분기보고 정성 항목을
-- financial_statements 에 함께 저장해 메인 표/원본 대조 뷰에서도 계속 보이게 한다.
-- 재실행 안전(IF NOT EXISTS).

alter table public.financial_statements
  add column if not exists funding_round      text,     -- 투자유치여부 (None/Done/Expected 등)
  add column if not exists funding_series     text,     -- 라운드 시리즈
  add column if not exists total_raised       numeric,  -- 누적 조달액
  add column if not exists business_highlight text,     -- 비즈니스 하이라이트(사업/개발/영업 현황)
  add column if not exists head_count         int;      -- 직원 수
