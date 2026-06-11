-- =============================================================================
-- SecondaryDesk — 매물 상태 카테고리 개편
-- =============================================================================
-- 기존: 준비중 / 세일즈중 / 거래완료 / 보류
-- 변경: LIVE / ON SALE / EXIT / W/O
-- 매핑: 준비중→LIVE, 세일즈중→ON SALE, 거래완료→EXIT, 보류→W/O
-- 기본값: LIVE
--
-- enum 값 교체는 새 타입(listing_status_v2)으로 컬럼을 변환한 뒤 옛 타입을
-- 제거·개명하는 방식. ⚠️ 한 번만 실행(재실행 비멱등).
-- =============================================================================

-- 1) 기존 기본값 제거(옛 라벨이라 새 타입으로 캐스팅 불가)
alter table public.listings alter column status drop default;

-- 2) 새 enum
do $$
begin
  if not exists (select 1 from pg_type where typname = 'listing_status_v2') then
    create type listing_status_v2 as enum ('LIVE', 'ON SALE', 'EXIT', 'W/O');
  end if;
end $$;

-- 3) 컬럼 타입 변환 + 값 매핑
alter table public.listings
  alter column status type listing_status_v2
  using (
    case status::text
      when '세일즈중' then 'ON SALE'
      when '거래완료' then 'EXIT'
      when '보류' then 'W/O'
      when '준비중' then 'LIVE'
      else 'LIVE'
    end::listing_status_v2
  );

-- 4) 새 기본값
alter table public.listings alter column status set default 'LIVE';

-- 5) 옛 타입 제거 후 새 타입을 원래 이름으로 개명
drop type if exists listing_status;
alter type listing_status_v2 rename to listing_status;
