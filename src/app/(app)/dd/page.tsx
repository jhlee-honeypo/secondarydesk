import { Card } from "@/components/ui/card";

import { listBatches, loadBatch } from "./data";
import { BatchPicker } from "./_components/batch-picker";
import { DdBoard } from "./_components/dd-board";

export const dynamic = "force-dynamic";

export default async function DdPage({
  searchParams,
}: {
  // Next.js 16 — searchParams 는 Promise 다.
  searchParams: Promise<{ batch?: string }>;
}) {
  const [{ batch: batchId }, batches] = await Promise.all([
    searchParams,
    listBatches(),
  ]);

  // 배치를 지정하지 않으면 가장 최근 것을 연다(목록은 거의 항상 1~2개다).
  const selectedId = batchId ?? batches[0]?.id ?? null;
  const data = selectedId ? await loadBatch(selectedId) : null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">서류실사</h1>
        <p className="text-sm text-muted-foreground">
          배치 기수 지원 기업의 제출 서류를 AI 로 훑어 투심 대상을 추립니다. 2단계로
          가릅니다 — ① 필수 서류가 다 있고 유효한지(세는 일이라 코드로 판정),
          ② 서류 내용에 투자 걸림돌이 있는지(AI 판정). AI 결과는 초안이며 최종
          판정은 사람이 확정합니다.
        </p>
      </div>

      <BatchPicker batches={batches} selectedId={selectedId} />

      {!data ? (
        <Card className="p-10 text-center text-sm text-muted-foreground">
          배치를 먼저 만들어 주세요. 배치 단위로 평가 기준과 기업 목록이 묶입니다.
        </Card>
      ) : (
        <DdBoard data={data} />
      )}
    </div>
  );
}
