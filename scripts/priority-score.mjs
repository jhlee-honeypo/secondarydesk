#!/usr/bin/env node
// slab-bot DB 확장 우선순위 산출 — docs/slab-bot-db-expansion.md §7 의 계산 근거.
//
//   node scripts/priority-score.mjs              순위표
//   node scripts/priority-score.mjs --sensitivity 축별 민감도 스윕 + 극단 시나리오
//
// 점수·가중치는 파라미터다. 항목이 늘거나 §7.1 실측이 갱신되면 아래 표만 고치고 다시 돌린다.
// 외부 의존 없음(순수 계산).

// ── 축 정의 (§7.2) ───────────────────────────────────────────────────────────
//   D  수요빈도       질의 로그 실측 비율
//   G  실패갭         지금 못 답하는가 (불가 / 오답 / full-scan 추론)
//   L  파급범위       몇 개 질문유형 × 몇 개사
//   W  결정결착도     돈·리스크 걸린 정기 업무(감액검토·LP보고·펀드결산)에 쓰이나
//   S  원천확보도     5:필드로 존재 4:확보문서 추가추출 3:권한토글 2:접근협의 1:원천없음
//   A  갱신자동화     5:파이프라인 재실행 3:트리거자동·검토사람 1:계속 수기
//   T  추출결정성     5:필드/파싱 결정론 3:LLM+검증게이트 1:주관 판단
//                     └ 비정형 트랙에서는 Rt(검색가능성)로 교체 — 배점 동일
//   Q  답변품질비용   오답 위험 + 매 질의 재추론 비용
//   U  사용자폭       all_staff 로 갈 수 있는 정도 (§7.5 매핑표에서 산출)
//   R  권한·PII       감점 (−10~0)
const WEIGHTS = { D: 3, G: 4, L: 2, W: 3, S: 3, A: 3, T: 2, Q: 2, U: 1 };
const AXES = Object.keys(WEIGHTS);

// ── 후보 DB군 (§7.6) ─────────────────────────────────────────────────────────
// 게이트(§7.2) 통과분만. gate 필드가 있으면 탈락 사유이며 점수 산출에서 제외한다.
const CANDIDATES = [
  { name: "Exit 처분이력",              mode: "정형",      D: 5, G: 5, L: 3, W: 5, S: 5, A: 5, T: 5, Q: 1, U: 3, R: -2 },
  { name: "법인상태·법적사건",           mode: "정형",      D: 4, G: 5, L: 5, W: 5, S: 4, A: 4, T: 4, Q: 3, U: 5, R: -1 },
  { name: "상장·IPO",                   mode: "정형",      D: 4, G: 5, L: 2, W: 4, S: 3, A: 4, T: 5, Q: 5, U: 5, R:  0 },
  { name: "해외사업·진출국",             mode: "하이브리드", D: 4, G: 4, L: 3, W: 2, S: 5, A: 5, T: 3, Q: 5, U: 5, R:  0 },
  { name: "business highlight 배치태깅", mode: "하이브리드", D: 4, G: 4, L: 4, W: 2, S: 5, A: 4, T: 3, Q: 5, U: 5, R:  0 },
  { name: "조합 별칭사전",               mode: "정형",      D: 3, G: 5, L: 2, W: 2, S: 5, A: 3, T: 5, Q: 2, U: 5, R:  0 },
  { name: "라운드·투자자",               mode: "하이브리드", D: 3, G: 4, L: 4, W: 4, S: 3, A: 3, T: 2, Q: 3, U: 1, R: -3 },
  { name: "IR덱(slab첨부)",             mode: "비정형",    D: 2, G: 3, L: 3, W: 3, S: 5, A: 4, T: 2, Q: 2, U: 2, R: -4 },
  { name: "드라이브",                    mode: "비정형",    D: 1, G: 3, L: 4, W: 3, S: 3, A: 3, T: 3, Q: 2, U: 1, R: -7 },
  { name: "people",                     mode: "정형",      D: 2, G: 2, L: 3, W: 2, S: 2, A: 2, T: 3, Q: 3, U: 3, R: -3 },
  { name: "메일",                        mode: "비정형",    D: 0, G: 3, L: 4, W: 3, S: 2, A: 4, T: 2, Q: 2, U: 1, R: -9 },
  { name: "메신저·미팅",                 mode: "비정형",    gate: "원천 미확보 (Jandi export 샘플 없음)" },
];

const ACCESS = { 정형: "tool", 하이브리드: "tool+RAG", 비정형: "RAG" };

const scored = (w = WEIGHTS) =>
  CANDIDATES.filter((c) => !c.gate)
    .map((c) => ({ ...c, score: AXES.reduce((s, a) => s + c[a] * w[a], 0) + c.R }))
    .sort((a, b) => b.score - a.score);

function printRanking() {
  const rows = scored();
  console.log("순위  DB군                          양식        점수  접근");
  rows.forEach((r) => {
    // 동점은 같은 순위로 표기
    const rank = rows.findIndex((x) => x.score === r.score) + 1;
    console.log(
      `${String(rank).padStart(4)}. ${r.name.padEnd(28)} ${r.mode.padEnd(10)} ${String(r.score).padStart(4)}  ${ACCESS[r.mode]}`,
    );
  });
  for (const c of CANDIDATES.filter((c) => c.gate)) {
    console.log(`   —. ${c.name.padEnd(28)} ${c.mode.padEnd(10)} 게이트 탈락 — ${c.gate}`);
  }
  const avg = (m) => {
    const g = rows.filter((r) => r.mode === m);
    return `${m} ${Math.round(g.reduce((a, r) => a + r.score, 0) / g.length)}(n=${g.length})`;
  };
  console.log("\n양식별 평균: " + ["정형", "하이브리드", "비정형"].map(avg).join(" | "));
}

function printSensitivity() {
  const base = scored().map((r) => r.name);
  const set5 = (a) => [...a.slice(0, 5)].sort().join("|");
  // 인접 근사동점(91/90)의 자리바꿈은 의미 없는 노이즈다. 그래서 둘로 나눠 본다:
  //   집합 — 상위5 "구성"이 바뀌는가 (순서 무시). 바뀌면 착수 대상이 달라진다.
  //   순서 — 상위3 "순서"가 바뀌는가. 바뀌면 착수 순번이 달라진다.
  console.log("\n── 축별 민감도: 배점을 0~8 로 스윕 ──");
  for (const ax of AXES) {
    const setFlips = [];
    const ordFlips = [];
    for (let w = 0; w <= 8; w++) {
      const r = scored({ ...WEIGHTS, [ax]: w }).map((x) => x.name);
      if (set5(r) !== set5(base)) setFlips.push(w);
      if (r.slice(0, 3).join("|") !== base.slice(0, 3).join("|")) ordFlips.push(w);
    }
    const fmt = (label, f) => (f.length ? `${label} @ w=${f.join(",")}` : `${label} 불변`);
    console.log(
      `  ${ax} (기준 ${WEIGHTS[ax]}): ${fmt("상위5 집합", setFlips)} / ${fmt("상위3 순서", ordFlips)}`,
    );
  }

  const zero = Object.fromEntries(AXES.map((a) => [a, 0]));
  const scenarios = {
    "가치만(비용 무시)": { ...WEIGHTS, S: 0, A: 0, T: 0 },
    "비용만(가치 무시)": { ...zero, S: 3, A: 3, T: 2 },
    "수요최우선(D=8)": { ...WEIGHTS, D: 8 },
    "자동화최우선(A=8)": { ...WEIGHTS, A: 8 },
    "결정결착최우선(W=8)": { ...WEIGHTS, W: 8 },
    "실패갭 무시(G=0)": { ...WEIGHTS, G: 0 },
    "전 직원 확대(U=3)": { ...WEIGHTS, U: 3 },
    "심사역 전용(U=0)": { ...WEIGHTS, U: 0 },
    "전축 균등(all=3)": Object.fromEntries(AXES.map((a) => [a, 3])),
  };
  console.log("\n── 극단 시나리오: 상위3 ──");
  for (const [n, w] of Object.entries(scenarios)) {
    console.log(`  ${n.padEnd(22)} → ` + scored(w).slice(0, 3).map((r) => `${r.name}(${r.score})`).join(" > "));
  }
}

printRanking();
if (process.argv.includes("--sensitivity")) printSensitivity();
