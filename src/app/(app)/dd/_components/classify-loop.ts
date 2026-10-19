// 분류 루프(클라이언트). 파일 단위 서버 액션을 순차 호출하고 진행률을 알린다.
//
// 루프를 서버가 아니라 클라이언트가 도는 이유는 actions.ts classifyOneFile 주석 참조
// (시간 예산 + 중단 지점 파악 + 실패 건만 재시도).
//
// 순차인 이유: 동시에 던지면 Anthropic 429 를 맞는데, 그때 어느 파일이 실패했는지
// 추적이 어려워진다. 실사 한 건당 파일은 수십 개 수준이라 순차로 충분하다.

import { classifyOneFile, listPendingClassification, runCompleteness } from "../actions";

export type ClassifyProgress = {
  done: number;
  total: number;
  fileName: string;
};

export type ClassifyOutcome = {
  classified: number;
  failures: string[];
  /** 분류할 파일이 애초에 없었는가(전부 분류됨 / 판독 불가만 남음) */
  nothingToDo: boolean;
};

export async function classifyAllFiles(
  companyId: string,
  onProgress: (p: ClassifyProgress) => void,
): Promise<ClassifyOutcome> {
  const pendingRes = await listPendingClassification(companyId);
  if (!pendingRes.ok) return { classified: 0, failures: [pendingRes.error], nothingToDo: false };

  const pending = pendingRes.data;
  if (pending.length === 0) {
    // 분류할 게 없어도 완결성은 다시 센다 — 사람이 분류를 고쳤거나 파일을 지운 뒤
    // 이 버튼을 누르는 경우가 있다.
    await runCompleteness(companyId);
    return { classified: 0, failures: [], nothingToDo: true };
  }

  const failures: string[] = [];
  let classified = 0;

  for (let i = 0; i < pending.length; i += 1) {
    const f = pending[i];
    onProgress({ done: i, total: pending.length, fileName: f.fileName });
    const res = await classifyOneFile(f.id);
    if (res.ok) classified += 1;
    else failures.push(res.error);
  }
  onProgress({ done: pending.length, total: pending.length, fileName: "" });

  await runCompleteness(companyId);
  return { classified, failures, nothingToDo: false };
}
