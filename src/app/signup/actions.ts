"use server";

import { createClient } from "@/lib/supabase/server";

export type SignupState =
  | { ok: true }
  | { ok: false; error: string }
  | undefined;

/**
 * 승인제 회원가입. 이메일+비밀번호+성/이름을 받아 Supabase Auth 계정을 만든다.
 * 성/이름은 user metadata 로 전달되어 handle_new_user 트리거가 프로필을 구성한다.
 * 신규 계정은 approved=false(미승인) 상태이며, 가입 직후 세션이 생겼더라도
 * 즉시 로그아웃해 관리자 승인 전에는 앱에 들어오지 못하게 한다.
 */
export async function signup(
  _prev: SignupState,
  formData: FormData,
): Promise<SignupState> {
  const lastName = String(formData.get("last_name") ?? "").trim();
  const firstName = String(formData.get("first_name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!lastName || !firstName || !email || !password) {
    return { ok: false, error: "성·이름·이메일·비밀번호를 모두 입력하세요." };
  }
  if (password.length < 8) {
    return { ok: false, error: "비밀번호는 8자 이상이어야 합니다." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        first_name: firstName,
        last_name: lastName,
        name: `${lastName}${firstName}`,
      },
    },
  });

  if (error) {
    return { ok: false, error: error.message };
  }

  // 가입 직후 세션이 생성됐을 수 있으므로(이메일 확인 비활성 시) 즉시 로그아웃.
  await supabase.auth.signOut();
  return { ok: true };
}
