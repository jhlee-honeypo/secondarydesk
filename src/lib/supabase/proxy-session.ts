import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Proxy(구 Middleware)에서 매 요청마다 Supabase 세션을 갱신하고
 * 미인증 사용자를 로그인 화면으로 보내는 헬퍼.
 *
 * Next.js 16에서 Middleware는 Proxy로 명칭/규칙이 바뀌었다(기능 동일).
 * Supabase 권장 패턴: createServerClient ~ getUser() 사이에 다른 로직을 넣지 않는다.
 */

// 인증 없이 접근 가능한 경로
const PUBLIC_PATHS = ["/login", "/signup"];

function isPublic(pathname: string): boolean {
  return PUBLIC_PATHS.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
}

export async function updateSession(request: NextRequest) {
  // 크론 등 자체적으로 인증하는 API(CRON_SECRET)는 세션 가드를 우회한다.
  // 크론 호출엔 세션 쿠키가 없어 가드에 걸리면 /login 으로 리다이렉트돼 버린다.
  if (request.nextUrl.pathname.startsWith("/api/cron/")) {
    return NextResponse.next({ request });
  }

  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // 중요: createServerClient와 getUser() 사이에 로직을 넣지 말 것.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;

  // 미인증 + 보호 경로 → 로그인 화면 (§F1: 비로그인 시 데이터 접근 차단)
  if (!user && !isPublic(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return copyCookies(supabaseResponse, NextResponse.redirect(url));
  }

  // 인증됨 + 로그인/가입 화면 → 홈으로 (승인 여부는 (app) 레이아웃에서 판정)
  if (user && (pathname === "/login" || pathname === "/signup")) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return copyCookies(supabaseResponse, NextResponse.redirect(url));
  }

  return supabaseResponse;
}

// 갱신된 인증 쿠키를 리다이렉트 응답으로 옮겨 세션이 유실되지 않게 한다.
function copyCookies(from: NextResponse, to: NextResponse): NextResponse {
  from.cookies.getAll().forEach((cookie) => to.cookies.set(cookie));
  return to;
}
