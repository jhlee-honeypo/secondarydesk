import { cache } from "react";
import { createClient } from "./server";

export type UserRole = "member" | "lead";

export type Profile = {
  id: string;
  name: string | null;
  email: string | null;
  role: UserRole;
};

export type CurrentUser = {
  id: string;
  email: string | null;
  profile: Profile | null;
};

/**
 * 현재 로그인 사용자(인증 정보 + public.users 프로필)를 반환한다.
 * 비로그인 시 null. React cache 로 한 렌더 패스 내 중복 호출을 메모이즈.
 *
 * 보안: getUser() 는 Supabase Auth 서버에 토큰을 검증 요청하므로
 * 쿠키만 신뢰하는 getSession() 보다 안전하다(서버 측 인증 가드용).
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: profile } = await supabase
    .from("users")
    .select("id, name, email, role")
    .eq("id", user.id)
    .single<Profile>();

  return { id: user.id, email: user.email ?? null, profile };
});
