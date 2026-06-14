# DIVA 조합 스크래퍼

벤처캐피탈협회 전자공시(DIVA, diva.kvca.or.kr)의 벤처투자조합 목록을 받아
`/import/funds` 로 올릴 CSV를 만든다. DIVA는 공개 API가 없고 WAF가 비브라우저
요청을 차단하므로, **진짜 크롬(Playwright)** 으로 한국에서 직접 받아야 한다.
(Vercel 등 해외 IP·헤드리스 서버에서는 동작하지 않음 → 로컬 전용)

## 준비 (최초 1회)

```bash
npm i playwright --no-save
npx playwright install chromium
```

## 분기 갱신 (정기)

```bash
node scripts/diva/scrape.mjs        # 진짜 크롬으로 전량 받아 파싱
```

→ `tmp/diva-recon/out/funds.csv` 생성. 이 파일을 `/import/funds` 에 업로드한다.
조합ID(ASCT_ID)·운용사ID(OPER_INST_ID) 기준으로 멱등 적재되므로 매번 받아
덮어써도 중복이 생기지 않는다.

## 파일

- `scrape.mjs` — 자동 스크래퍼. 폼(#asctInfo)을 `TOTAL_YN=Y` 로 POST해 전량 HTML을
  받아 파싱(공동GP는 운용사별 행으로 분해). `--headless` / `YYYYMM`(공시연월) 인자 지원.
- `parse.mjs` — HTML → funds.json/csv 파서(`scrape.mjs` 가 재사용). 단독 실행 시
  기존 `tmp/diva-recon/out/page.html` 을 재파싱.
- `recon.mjs` — 사이트 구조 정찰용(네트워크 덤프). 평소엔 불필요.

## 주의

- 출력물은 `tmp/diva-recon/out/` 에 저장된다. `network.json` 에 세션 쿠키가 담길 수
  있어 **`/tmp/` 는 .gitignore 로 제외**된다 — 출력물은 커밋하지 말 것.
- DIVA 공시는 최근 2년치만 보존된다.
