-- Bubble(sparkERP) 연동으로 채우는 신규 필드
--   listings.company_name_en : 영문 회사명 (Bubble company.company name eng)
--   holding_funds.commitment : 약정액(원) (Bubble fund.fund size)
--   holding_funds.bubble_id  : ERP fund._id (일괄 동기화 시 멱등 매칭 키)
-- 재실행 안전(IF NOT EXISTS).

alter table listings add column if not exists company_name_en text;

alter table holding_funds add column if not exists commitment numeric;

alter table holding_funds add column if not exists bubble_id text;

-- bubble_id 로 빠르게 매칭(부분 유니크: 값이 있는 행만 유일).
create unique index if not exists holding_funds_bubble_id_key
  on holding_funds (bubble_id)
  where bubble_id is not null;
