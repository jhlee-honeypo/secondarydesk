# SecondaryDesk

> VC 구주(Secondary) 세일즈 CRM — 만기 펀드 EXIT를 위한 구주 세일즈 활동을 관리하는 내부용 B2B Sales CRM.
> 제품 요구사항은 [`PRD.md`](./PRD.md) 참조.

투자사·조합·매물·딜을 한곳에서 관리하고, 적합도 매칭·EXIT 시뮬레이션·재무 점검까지
세일즈 한 사이클을 지원합니다. 이 저장소는 **참고용으로 공개**되며, 직접 실행하려면
본인 소유의 Supabase·Anthropic 키가 필요합니다(아래 [시작하기](#시작하기) 참조).

## 기술 스택

| 레이어 | 사용 |
|---|---|
| 프레임워크 | Next.js 16 (App Router) + TypeScript |
| UI | Tailwind CSS v4 + shadcn/ui |
| 테마/폰트 | 자체 ThemeProvider(라이트·다크) · Inter (한글 폴백: Pretendard → Apple SD Gothic Neo → Malgun Gothic) |
| DB/인증/스토리지 | Supabase (Postgres + Auth + RLS + Storage) |
| AI | Anthropic Claude SDK — 재무제표 PDF/이미지에서 핵심 값 자동 추출 |
| 외부 연동 | sparkERP(Bubble) Data API — 포트폴리오·조합 데이터 온디맨드 조회 |
| 기타 | dnd-kit(칸반 보드) · xlsx(엑셀/CSV 임포트) |

디자인 토큰(인디고 포인트 · 8px 라운드 · 흰색/off-white 표면)은 PRD §12.3 과
`design-reference/secondarydesk/DESIGN.md` 를 단일 출처로 삼아 `src/app/globals.css` 에 적용함.
`design-reference/` 와 `docs/wireframes/` 는 **시각 레퍼런스 전용**(빌드 대상 아님, 코드 미복사).

## 주요 기능

| 영역 | 설명 |
|---|---|
| 대시보드 | 펀넬 · 매물별 진척 · 드랍/활동량 · 기간·펀드 필터 (F11) |
| 딜 보드 | 단계별 칸반(dnd-kit) + 딜 생성/태깅 (F4·F6) |
| 투자사·조합·컨택 | CRUD + 상세 통합 뷰(개요·조합·컨택·딜·활동 탭) (F2) |
| 조합 탐색 | 투자사 운용 조합 조회 · 드라이파우더 추정 · 결성일 일단위 보정 |
| 매물 | 매물 CRUD + 운용펀드 태깅 · sparkERP 포트폴리오 연동 (F3) |
| 운용펀드 | 펀드 CRUD + sparkERP(Bubble) 동기화 |
| EXIT 시뮬레이터 | 다음 라운드 단가 비교 · 밸류에이션 기반 단가 추정(slab 자동) |
| 재무 점검 | 재무제표 업로드 → Claude 자동 추출 → 건전성 판정 |
| 적합도 매칭 | 조합 mandate 기반 Top N 추천 + 딜 1클릭 생성 (F7) |
| 소개·검색·알림 | 소개 네트워크(F8) · 전역 검색/저장된 뷰(F9) · 알림(F10) |
| 구성원 관리 | 승인제 가입 + 관리자(lead) 승인/거부 (F1) |
| 데이터 임포트 | 엑셀/CSV → 투자사·조합·컨택·매물 일괄 생성 (F13) |

## 시작하기

### 1. 의존성 설치

```bash
npm install
```

### 2. Supabase 프로젝트 연결

아직 Supabase 프로젝트가 없다면:

1. <https://supabase.com> 에서 새 프로젝트 생성 (Region은 가까운 곳, 예: Northeast Asia).
2. 대시보드 > **Project Settings > API** 에서 다음 값을 확인:
   - **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
   - **anon / public** key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
3. 환경변수 파일을 만들고 값을 채움:

   ```powershell
   # Windows PowerShell
   Copy-Item .env.example .env.local
   ```

   ```bash
   # macOS / Linux
   cp .env.example .env.local
   ```

   ```
   NEXT_PUBLIC_SUPABASE_URL=https://xxxxxxxx.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOi...
   ```

   재무 점검·sparkERP 연동 등 일부 기능은 추가 키가 필요합니다([환경변수](#환경변수) 참조).
   기본 CRM 기능은 위 두 값만으로 동작합니다.

> `.env.local` 은 git에 커밋되지 않음. anon key는 공개되어도 안전하며, 데이터 보호는 Supabase RLS로 처리함.

### 3. 개발 서버 실행

```bash
npm run dev
```

<http://localhost:3000> 접속 → 비로그인 시 `/login` 으로 리다이렉트.
계정 생성·승인 흐름은 아래 [인증](#5-인증-승인제) 참조.

### 4. DB 스키마 적용

스키마·RLS 정책은 [`supabase/migrations/`](./supabase/migrations) 에 SQL 로 정의돼 있다.
**파일명 순서대로** 적용한다.

- **방법 A — SQL Editor(권장, 비개발자용)**: Supabase 대시보드 > **SQL Editor** 에서
  마이그레이션 파일을 파일명 순서대로 붙여넣고 차례로 실행.
- **방법 B — Supabase CLI**: `supabase link` 후 `supabase db push`

적용 확인: **Table Editor** 에 테이블들이 보이고, 각 테이블에 **RLS enabled** 표시.

### 5. 인증 (승인제)

자가입 후 **관리자(lead) 승인**을 거쳐야 앱에 들어올 수 있는 구조다(PRD §8).

1. **가입**: `/signup` 에서 성·이름·이메일·비밀번호로 가입. 가입 직후엔 미승인 상태라
   `/pending`(승인 대기) 화면으로 안내된다.
2. **승인**: 관리자(`role = lead`)가 **구성원** 탭에서 가입자를 승인/거부한다.
   최초 관리자 1명은 Supabase Table Editor 에서 해당 사용자의 `users.role` 을 `lead` 로 지정.
3. **로그인**: 승인되면 로그인 후 홈에서 이름·역할 배지·로그아웃 버튼이 보인다.

> Supabase 대시보드 > **Authentication > Providers > Email** 에서 **"Confirm email"** 은
> 꺼 두는 것을 권장한다(앱이 자체 승인 관문을 두므로 이메일 확인은 중복 절차).
> 비로그인 상태로 보호 경로(`/` 등)에 접근하면 항상 `/login` 으로 리다이렉트된다(Proxy 가드).

## 환경변수

| 변수 | 필수 | 용도 |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | ✅ | Supabase 프로젝트 URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✅ | Supabase anon(공개) 키 — RLS로 보호 |
| `SUPABASE_SERVICE_ROLE_KEY` | 일부 | 서버 전용 관리 작업·백필 스크립트(RLS 우회). **절대 클라이언트 노출 금지** |
| `ANTHROPIC_API_KEY` | 재무 점검 | 재무제표 자동 추출(Claude). 미설정 시 해당 기능만 비활성 |
| `BUBBLE_API_BASE` | 선택 | sparkERP(Bubble) API 베이스. 기본값 내장 |
| `BUBBLE_API_TOKEN` | 선택 | sparkERP 토큰. 현재 공개 읽기라 비워도 동작 |
| `CRON_SECRET` | 선택 | sparkERP 동기화 Cron 엔드포인트 보호용 |

## 주요 스크립트

| 명령 | 설명 |
|---|---|
| `npm run dev` | 개발 서버 |
| `npm run build` | 프로덕션 빌드 |
| `npm run start` | 빌드 결과 실행 |
| `npm run lint` | ESLint |

## 프로젝트 구조

```
supabase/
  migrations/         # DB 스키마·RLS SQL — 파일명 순서대로 적용
src/
  proxy.ts            # Next.js 16 Proxy(구 Middleware) — 세션 갱신 + 라우트 가드
  app/
    layout.tsx        # 루트 레이아웃 (폰트·테마·메타데이터)
    globals.css       # Tailwind v4 + 디자인 토큰(라이트/다크)
    login/            # 로그인 화면 + 서버 액션
    signup/           # 승인제 회원가입
    pending/          # 승인 대기 화면
    api/
      cron/erp-sync/  # sparkERP 동기화 Cron 라우트
      financial-file/ # 재무제표 파일 업로드 처리
    (app)/            # 인증 영역(공통 셸: 좌측 네비 + 상단 바)
      layout.tsx      # 셸 + 인증 가드 + 버전 라벨
      page.tsx        # 대시보드 홈
      deals/          # 딜 보드(칸반)
      investors/      # 투자사 목록·상세 + CRUD
      associations/   # 조합 탐색(드라이파우더 추정)
      listings/       # 매물 + sparkERP 포트폴리오 연동
      funds/          # 운용펀드 + sparkERP 동기화
      exit-scenario/  # EXIT 시뮬레이터
      financials/     # 재무 점검(Claude 추출)
      members/        # 구성원 관리(lead 전용)
      search/         # 전역 검색
      notifications/  # 알림
      import/         # 엑셀/CSV 일괄 임포트
  components/
    app/              # 셸 컴포넌트 (sidebar-nav, user-menu, import-wizard 등)
    ui/               # shadcn/ui
    theme-provider.tsx
  lib/
    types.ts          # 스키마 대응 TS 타입 + enum 옵션 상수
    format.ts         # KRW(억)·날짜 포맷 헬퍼
    analytics.ts      # 대시보드 집계
    match.ts          # 적합도 매칭
    exit-scenario.ts  # EXIT 시뮬레이션 계산
    financial-health.ts / claude-extract.ts  # 재무 건전성 판정 · Claude 추출
    fund-dry-powder.ts # 조합 드라이파우더 추정
    bubble.ts / erp-sync.ts  # sparkERP(Bubble) 연동
    csv.ts / normalize.ts    # 임포트 파싱·정규화
    version.ts        # 앱 버전·배포 커밋 라벨
    supabase/         # client / server / proxy-session / admin / auth(DAL)
    utils.ts          # cn() 등 유틸
```

## 로드맵 (PRD §9)

- [x] **Step 0** — 레포 세팅: Next.js + Tailwind + shadcn/ui + Supabase 연결
- [x] **Step 1** — 스키마 마이그레이션(§4 전체) + RLS
- [x] **Step 2** — 인증(F1) — 이메일/비밀번호 로그인 · Proxy 라우트 가드 · 승인제 가입
- [x] **Step 3** — 투자사·조합·컨택 CRUD + 상세 통합 뷰(F2)
- [x] **Step 4** — 운용펀드 CRUD + 매물 CRUD + 펀드 태깅(F3)
- [x] **Step 5** — 딜 생성/태깅(F6) + 칸반 보드(F4, dnd-kit)
- [x] **Step 6** — 활동 타임라인(F5) — **▲ 여기까지 MVP**
- [x] **Step 7** — 적합도 매칭(F7)
- [x] **Step 8** — 소개 네트워크(F8) · 전역 검색/저장된 뷰(F9) · 알림(F10)
- [x] **Step 9** — 대시보드/애널리틱스(F11)
- [x] **Step 10** — 데이터 임포트(F13)
- [x] **확장** — sparkERP(Bubble) 연동 · 조합 탐색/드라이파우더 · EXIT 시뮬레이터 · 재무 점검(Claude)
- [ ] (보류) F12 — 메일/캘린더 외부 연동

## 배포

- **프로덕션**: <https://project1-two-drab.vercel.app> (Vercel · 로그인 필요)
- **자동 배포**: `main` 브랜치 푸시 시 Vercel이 자동 프로덕션 배포(브랜치/PR은 프리뷰 배포).
- 수동 배포: `vercel --prod`
- 런타임 환경변수는 위 [환경변수](#환경변수) 표 참조. Vercel 프로젝트 설정에 등록한다.
