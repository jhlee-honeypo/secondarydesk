# 배포 가이드 (Vercel)

SecondaryDesk는 Next.js 16 + Supabase 앱으로, Vercel 무중단 배포에 적합합니다.
빌드 검증 완료(`npm run build` 정상), 환경변수는 아래 2개뿐입니다.

## 0. 준비물

- Vercel 계정 (https://vercel.com — GitHub/이메일로 가입)
- Supabase 값 2개 (대시보드 > Project Settings > API)
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`

> 두 값 모두 **공개(anon) 키**라 노출되어도 안전합니다(데이터는 RLS로 보호).

## 방법 A — Vercel CLI (가장 빠름, GitHub 불필요)

프롬프트에 `!` 를 붙여 이 세션에서 직접 실행할 수 있습니다.

```
! npm i -g vercel          # CLI 설치(최초 1회)
! vercel login             # 브라우저/이메일로 로그인
! vercel                   # 첫 배포: 프로젝트 생성·링크 (질문은 기본값 Enter)
```

배포 후 환경변수 등록 → 재배포:

```
! vercel env add NEXT_PUBLIC_SUPABASE_URL production
! vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY production
! vercel --prod            # 프로덕션 재배포
```

(env 값은 붙여넣기로 입력. Preview/Development 환경에도 동일하게 추가하려면
`production` 대신 환경을 바꿔 반복하거나 Vercel 대시보드에서 일괄 설정.)

## 방법 B — GitHub + Vercel 대시보드

```
git init
git add -A
git commit -m "SecondaryDesk: 초기 배포"
# GitHub에 빈 레포 생성 후:
git remote add origin https://github.com/<계정>/<레포>.git
git branch -M main
git push -u origin main
```

이후 vercel.com → New Project → 해당 레포 Import →
Environment Variables 에 위 2개 입력 → Deploy.

## 1. 배포 후 점검

- 로그인 페이지가 뜨고, 팀 계정으로 로그인되는지
- 대시보드/투자사/매물/딜 보드가 정상 로드되는지
- (선택) Supabase Auth 의 공개가입 OFF, 팀원만 초대 상태인지 재확인

## 참고

- 빌드 명령/출력 디렉터리: Vercel 기본값(`next build`) 그대로 사용 — 별도 설정 불필요.
- `proxy.ts`(Next 16 미들웨어)는 Vercel에서 그대로 동작.
- `.env.local` 은 git에 올라가지 않으므로(.gitignore), 값은 **반드시 Vercel 환경변수**에 등록해야 런타임에 Supabase에 연결됩니다.
