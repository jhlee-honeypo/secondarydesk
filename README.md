# SecondaryDesk

> VC 구주(Secondary) 세일즈 CRM — 만기 펀드 EXIT를 위한 구주 세일즈 활동 관리 내부용 B2B Sales CRM.
> 제품 요구사항은 [`PRD.md`](./PRD.md) 참조.

## 기술 스택

| 레이어 | 사용 |
|---|---|
| 프레임워크 | Next.js 16 (App Router) + TypeScript |
| UI | Tailwind CSS v4 + shadcn/ui |
| 테마/폰트 | next-themes(라이트·다크) · Inter (한글 폴백: Pretendard → Apple SD Gothic Neo → Malgun Gothic) |
| DB/인증/스토리지 | Supabase (Postgres + Auth + RLS + Storage) |

디자인 토큰(인디고 포인트 · 8px 라운드 · 흰색/off-white 표면)은 PRD §12.3 과
`design-reference/secondarydesk/DESIGN.md` 를 단일 출처로 삼아 `src/app/globals.css` 에 적용함.
`design-reference/` 와 `docs/wireframes/` 는 **시각 레퍼런스 전용**(빌드 대상 아님, 코드 미복사).

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
3. 환경변수 파일을 만들고 위 값을 채움:

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

> `.env.local` 은 git에 커밋되지 않음. anon key는 공개되어도 안전하며, 데이터 보호는 Supabase RLS(Step 1)로 처리함.

### 3. 개발 서버 실행

```bash
npm run dev
```

<http://localhost:3000> 접속 → 홈 화면 상단 **"Supabase 연결 상태"** 카드가
`연결됨`(초록 배지)으로 표시되면 DB 연결 확인 완료.
값이 비어 있으면 `미설정`, 키가 틀리면 `오류` 로 표시됨.

### 4. DB 스키마 적용 (Step 1)

스키마·RLS 정책은 [`supabase/migrations/`](./supabase/migrations) 에 SQL 로 정의돼 있다.
**파일명 순서대로** 적용한다.

- **방법 A — SQL Editor(권장, 비개발자용)**: Supabase 대시보드 > **SQL Editor** 에서
  1. `20260609000000_initial_schema.sql` 내용을 붙여넣고 실행
  2. 이어서 `20260609000001_rls_policies.sql` 실행
- **방법 B — Supabase CLI**: `supabase link` 후 `supabase db push`

적용 확인: **Table Editor** 에 9개 테이블(users·investors·funds·contacts·listings·
holding_funds·listing_funds·deals·activities)이 보이고, 각 테이블 **RLS enabled** 표시.

### 5. 인증 설정 (Step 2 — 초대 전용)

이 앱은 **회원가입 화면이 없고**, 계정은 관리자가 Supabase 대시보드에서 직접 만든다.

1. **공개가입 차단**: 대시보드 > **Authentication > Sign In / Providers**(또는 Settings)
   에서 **"Allow new users to sign up"** 을 **OFF**. (외부인 자가입 차단, PRD §8)
2. **팀원 계정 생성**: **Authentication > Users > Add user** →
   이메일·비밀번호 입력 후 **"Auto Confirm User"** 체크(이메일 인증 생략).
   - 생성 즉시 `public.users` 프로필이 트리거로 자동 생성됨(`handle_new_user`).
   - 기본 역할은 `member`. 팀 리드는 Table Editor 에서 `users.role` 을 `lead` 로 변경.
3. **로그인 확인**: `npm run dev` → <http://localhost:3000> 접속 시 `/login` 으로
   리다이렉트 → 생성한 계정으로 로그인 → 홈에서 이름·역할 배지·로그아웃 버튼 확인.

> 비로그인 상태로 보호 경로(`/` 등)에 접근하면 항상 `/login` 으로 리다이렉트된다(Proxy 가드).

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
  migrations/         # DB 스키마·RLS SQL (Step 1) — 파일명 순서대로 적용
src/
  proxy.ts            # Next.js 16 Proxy(구 Middleware) — 세션 갱신 + 라우트 가드
  app/
    layout.tsx        # 루트 레이아웃 (폰트·테마 Provider·메타데이터)
    globals.css       # Tailwind v4 + 디자인 토큰(라이트/다크)
    login/            # 로그인 화면 + login/logout 서버 액션 (셸 없음)
    (app)/            # 인증 영역(공통 셸: 좌측 네비 + 상단 바)
      layout.tsx      # 셸 + 인증 가드
      page.tsx        # 대시보드 홈 (Step 9에서 본격화)
      investors/
        page.tsx          # 투자사 목록
        [id]/page.tsx     # 투자사 상세 (개요·조합·컨택·딜·활동 탭)
        actions.ts        # 투자사·조합·컨택 CRUD 서버 액션
        _components/       # 폼/삭제 다이얼로그 (client)
  components/
    app/              # 셸 컴포넌트 (sidebar-nav, user-menu)
    ui/               # shadcn/ui (button, card, badge, input, label, textarea,
                      #            select, dialog, tabs, dropdown-menu, checkbox)
    theme-provider.tsx
  lib/
    types.ts          # §4 스키마 대응 TS 타입 + enum 옵션 상수
    format.ts         # KRW(억)·날짜 포맷 헬퍼
    supabase/
      client.ts       # 브라우저용 클라이언트
      server.ts       # 서버(RSC·라우트·액션)용 클라이언트
      proxy-session.ts # Proxy용 세션 갱신·인증 가드 헬퍼
      auth.ts         # getCurrentUser() — 인증 사용자 + 프로필 (DAL)
    utils.ts          # cn() 등 유틸
```

## 로드맵 (PRD §9)

- [x] **Step 0** — 레포 세팅: Next.js + Tailwind + shadcn/ui + Supabase 연결
- [x] **Step 1** — 스키마 마이그레이션(§4 전체) + RLS — *9개 테이블 생성·RLS 적용 검증 완료*
- [x] **Step 2** — 인증(F1) — *이메일/비밀번호 로그인 · Proxy 라우트 가드 · 초대 전용*
- [x] **Step 3** — 투자사·조합·컨택 CRUD + 상세 통합 뷰(F2) — *앱 셸(좌측 네비) · 투자사 목록/상세 · 조합·컨택 CRUD*
- [ ] Step 4 — 운용펀드 CRUD + 매물 CRUD + 펀드 태깅(F3)
- [ ] Step 5 — 딜 생성/태깅(F6) + 칸반 보드(F4)
- [ ] Step 6 — 활동 타임라인(F5) — **▲ 여기까지 MVP**
