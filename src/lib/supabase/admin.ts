import { createServerClient } from "@supabase/ssr";

/**
 * service-role Supabase 클라이언트 — 크론·백그라운드 작업 전용.
 *
 * 세션 쿠키가 없는 실행 환경(Vercel Cron 등)에서는 authenticated RLS 정책을
 * 통과할 수 없으므로, RLS 를 우회하는 service-role 키를 사용한다. 쿠키 핸들러는
 * no-op 이다(저장할 세션 없음).
 *
 * ⚠️ 절대 클라이언트 컴포넌트/브라우저로 노출 금지. 서버 전용 코드에서만 import.
 * 필요 env: SUPABASE_SERVICE_ROLE_KEY (Supabase 대시보드 → Settings → API).
 */
export function createAdminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY 환경변수가 설정되지 않았습니다.");
  }
  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    cookies: {
      getAll() {
        return [];
      },
      setAll() {},
    },
  });
}
