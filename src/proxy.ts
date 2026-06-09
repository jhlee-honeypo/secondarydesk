import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy-session";

/**
 * Next.js 16 Proxy (이전 버전의 Middleware).
 * 모든 요청에서 Supabase 세션을 갱신하고 인증 가드를 적용한다.
 */
export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  // 정적 자산·이미지·favicon 을 제외한 모든 경로에서 실행 (인증은 전 경로 권장).
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
