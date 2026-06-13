-- 매물(listings)을 ERP company 와 제자리 동기화하기 위한 멱등 매칭 키.
--   listings.bubble_id : ERP company._id (한 번 매칭되면 이후 이름이 바뀌어도 유지)
-- 재실행 안전(IF NOT EXISTS).

alter table listings add column if not exists bubble_id text;

create unique index if not exists listings_bubble_id_key
  on listings (bubble_id)
  where bubble_id is not null;
