import { createAdminClient } from "@/lib/supabase/admin";
import { runErpSync } from "@/lib/erp-sync";

// Vercel Cron 전용 엔드포인트 — 매일 ERP(sparkERP) 제자리 동기화를 자동 실행한다.
// 스케줄은 vercel.json 의 crons 에 정의. 세션이 없으므로 service-role 클라이언트로
// 실행한다(RLS 우회). 미리보기 없이 바로 적용되지만, runErpSync 는 ERP 사실값만
// 덮고 영업값(약칭·상태·메모·자료링크)은 보존하도록 설계돼 있어 안전하다.

export const dynamic = "force-dynamic"; // 캐시 금지(항상 실행)
export const maxDuration = 300; // 펀드+매물 순차 갱신 — 넉넉히

export async function GET(request: Request) {
  // Vercel 은 CRON_SECRET 이 설정돼 있으면 cron 호출에 Authorization 헤더를 붙인다.
  // 설정돼 있을 때만 검증(미설정 시 누구나 호출 가능하므로 운영에선 반드시 설정).
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = request.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return new Response("Unauthorized", { status: 401 });
    }
  }

  try {
    const supabase = createAdminClient();
    const result = await runErpSync(supabase);
    const status = result.ok ? 200 : 500;
    return Response.json({ at: new Date().toISOString(), ...result }, { status });
  } catch (e) {
    const message = e instanceof Error ? e.message : "알 수 없는 오류";
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}
