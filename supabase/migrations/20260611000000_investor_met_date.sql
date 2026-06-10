-- F: 투자사를 처음 만난(컨택 시작) 일자. 딜 생성 시 새 투자사 등록에서 입력.
-- 재실행 안전(if not exists).
alter table public.investors
  add column if not exists met_date date;

comment on column public.investors.met_date is '투자사를 만난(첫 컨택) 일자';
