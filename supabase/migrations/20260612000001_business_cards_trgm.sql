-- 명함 검색 가속: searchBusinessCards 는 이름/소속에 `ilike '%검색어%'`(앞 와일드카드)
-- 를 쓴다. 일반 b-tree 인덱스는 앞 와일드카드를 못 타서 명함이 수천 건이면 매 검색이
-- 풀스캔이 된다. pg_trgm 트라이그램 GIN 인덱스는 부분일치 ilike 를 인덱스로 가속한다.
create extension if not exists pg_trgm;

create index if not exists business_cards_name_trgm
  on business_cards using gin (name gin_trgm_ops);

create index if not exists business_cards_company_trgm
  on business_cards using gin (company gin_trgm_ops);
