import { createAdminClient } from "@/lib/supabase/admin";
import { runFinancialSync } from "@/lib/financial-sync";

// Vercel Cron 전용 — slab 분기보고에 새로 올라온 재무제표를 추출해 적재한다.
// 스케줄은 vercel.json 의 crons. 세션이 없으므로 service-role 로 실행(RLS 우회).
//
// ⚠️ erp-sync 와 성격이 다르다. erp-sync 는 값 복사라 사실상 공짜지만, 여기는
// 파일 하나마다 Claude 호출이 붙어 비용·시간이 든다. 그래서 runFinancialSync 가
// 시간 예산과 상한을 두고 남은 건은 다음 실행으로 넘긴다(응답의 remaining).
//
// ⚠️ 사람의 검토를 건너뛰고 추출값을 그대로 저장한다 — 화면(/financials)의 수동
// 흐름과 달리 추출 오류가 건전성 등급에 바로 반영된다.

export const dynamic = "force-dynamic"; // 캐시 금지(항상 실행)
export const maxDuration = 300;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = request.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return new Response("Unauthorized", { status: 401 });
    }
  }

  try {
    // ?limit=N — 점검·소량 실행용(상한만 낮춘다. 기본은 모듈의 MAX_PER_RUN).
    const raw = new URL(request.url).searchParams.get("limit");
    const limit = raw && Number.isFinite(Number(raw)) ? Number(raw) : undefined;

    const supabase = createAdminClient();
    const result = await runFinancialSync(supabase, limit);
    return Response.json(
      { at: new Date().toISOString(), ...result },
      { status: result.ok ? 200 : 500 },
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : "알 수 없는 오류";
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}
