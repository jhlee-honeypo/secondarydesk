import { Card } from "@/components/ui/card";
import { getCurrentUser } from "@/lib/supabase/auth";
import { loadShareAudit } from "./data";
import { ShareAuditDashboard } from "./_components/share-audit-dashboard";

export const dynamic = "force-dynamic";

export default async function ShareAuditPage() {
  const [{ rows, summaries, queue, withRegistry, excludedTestRecords }, me] =
    await Promise.all([loadShareAudit(), getCurrentUser()]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">발행주식수 점검</h1>
        <p className="text-sm text-muted-foreground">
          조합별로 발행주식총수를 세 출처(slab 회사정보 · 회사 분기보고 자가입력 ·
          법인등기부등본)로 나란히 대조합니다. 판정은 slab 값과 등기값의 대조이며,
          등기값은 이미 쌓아 둔 등기 추출 데이터를 그대로 씁니다(별도 OCR 없음).
          {excludedTestRecords > 0 &&
            ` slab 테스트 레코드 ${excludedTestRecords}건은 제외했습니다.`}
        </p>
      </div>

      {rows.length === 0 ? (
        <Card className="p-10 text-center text-sm text-muted-foreground">
          slab 기업 목록을 불러오지 못했습니다. BUBBLE_API_TOKEN 설정을 확인하세요.
        </Card>
      ) : (
        <ShareAuditDashboard
          rows={rows}
          summaries={summaries}
          queue={queue}
          withRegistry={withRegistry}
          currentUserId={me?.id ?? null}
        />
      )}
    </div>
  );
}
