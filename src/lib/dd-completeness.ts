// 서류 완결성 판정(1단계) — **AI 콜 없이 코드로** 센다.
//
// 왜 AI 에 맡기지 않는가: "필수 16종 중 뭐가 빠졌나" 는 세는 일이다. 모델에
// 맡기면 같은 입력에 다른 답이 나오고(실측된 함정 — 중첩 스키마 미준수 시 조용히
// 빈 값), 투심에서 "왜 이 회사가 탈락했냐" 에 답할 수 없다. AI 는 앞단에서
// "이 파일이 무슨 서류인가"(dd-screen.classifyDocument)만 판단하고, 그 결과를
// 여기서 결정론적으로 집계한다.

import type { DocCriterionSeed } from "./dd-defaults";
import type { Verdict } from "./dd-screen";

export type DocStatus =
  /** 제출됐고 유효 */
  | "ok"
  /**
   * 파일 대신 '해당 없음' 사유로 응답한 항목. 응답으로는 충족이지만 **서류로
   * 검증된 것은 아니다** — 2단계 리스크 판정은 이 진술을 자기확약으로 취급한다.
   */
  | "declared"
  /**
   * 법인 설립 후에야 발급되는 서류(등기부·정관·자본금). 지금은 존재할 수 없으니
   * 누락으로 세지 않고 **필수 분모에서 뺀다**.
   */
  | "deferred"
  /** 필수인데 해당 파일 없음 */
  | "missing"
  /** 파일은 있으나 AI 가 읽지 못하는 형식(xlsx·hwp 등) */
  | "unreadable"
  /** 신선도 기준을 넘김(납세증명 등) */
  | "stale"
  /** 신선도 기준이 있는데 문서에서 발급일을 못 읽음 */
  | "undated"
  /** 분류 신뢰도 low — 사람이 맞는지 봐야 함 */
  | "uncertain"
  /** 선택 항목이고 미제출 */
  | "na";

export type CompletenessItem = {
  code: string;
  label: string;
  required: boolean;
  status: DocStatus;
  /** 이 항목에 매칭된 파일 id 들(여러 개일 수 있다 — 분할 스캔 등). */
  fileIds: string[];
  reason: string;
};

export type CompletenessResult = {
  verdict: Verdict;
  summary: string;
  items: CompletenessItem[];
  /**
   * 필수 항목 충족 수 / 전체 필수 수. 분모에서 deferred(설립 후 제출 예정)는
   * 빠진다 — 제출 포털도 그렇게 센다(치즈랩 10/10, 프리프 2/11).
   */
  requiredMet: number;
  requiredTotal: number;
  /** 어느 체크리스트에도 안 붙은 파일 id — 화면에서 사람이 지정하게 띄운다. */
  unmatchedFileIds: string[];
  /** 문서상 회사명이 대상 기업과 다른 파일. 엉뚱한 회사 서류가 섞인 신호. */
  companyMismatches: { fileId: string; docCompany: string }[];
};

/** 파일 없이 응답한 항목(dd_declarations). */
export type DdDeclarationForJudging = {
  criterionCode: string;
  kind: "none_applicable" | "deferred";
  reason: string;
};

export type DdFileForJudging = {
  id: string;
  fileName: string;
  /** 사람이 고친 코드가 있으면 그것, 없으면 AI 분류 코드. null = 아직 분류 안 함. */
  effectiveCode: string | null;
  issuedDate: string | null;
  asOfDate: string | null;
  readable: boolean;
  confidence: "" | "high" | "medium" | "low";
  docCompany: string;
};

/** '주식회사 스파크랩' / '(주)스파크랩' / '스파크랩 주식회사' → 'ㅅ파크랩' 비교용 키. */
function companyKey(name: string): string {
  return name
    .replace(/\(주\)|\(유\)|주식회사|유한회사|유한책임회사/g, "")
    .replace(/[\s·.,'"`\-_]/g, "")
    .toLowerCase();
}

function daysBetween(fromIso: string, to: Date): number {
  const t = Date.parse(fromIso);
  if (Number.isNaN(t)) return Number.NaN;
  return Math.floor((to.getTime() - t) / 86400000);
}

/**
 * 완결성 판정.
 *
 * @param referenceDate 신선도를 재는 기준 시점. 투심일을 넣으면 "투심 때 만료"가
 *   잡힌다. 기본은 오늘.
 */
export function judgeCompleteness(args: {
  companyName: string;
  criteria: DocCriterionSeed[];
  files: DdFileForJudging[];
  /** 파일 대신 사유로 응답한 항목. 없으면 빈 배열과 같다. */
  declarations?: DdDeclarationForJudging[];
  referenceDate?: Date;
}): CompletenessResult {
  const now = args.referenceDate ?? new Date();
  const declByCode = new Map(
    (args.declarations ?? []).map((d) => [d.criterionCode, d]),
  );
  const byCode = new Map<string, DdFileForJudging[]>();
  const unmatchedFileIds: string[] = [];

  for (const f of args.files) {
    // 분류 전(null)과 '해당 없음'('')은 둘 다 체크리스트에 안 붙은 상태다.
    if (!f.effectiveCode) {
      unmatchedFileIds.push(f.id);
      continue;
    }
    const list = byCode.get(f.effectiveCode);
    if (list) list.push(f);
    else byCode.set(f.effectiveCode, [f]);
  }

  // 분류된 파일인데 기준 목록에 없는 코드(항목을 지운 경우)도 미매칭으로 본다.
  const codeSet = new Set(args.criteria.map((c) => c.code));
  for (const [code, list] of byCode) {
    if (!codeSet.has(code)) unmatchedFileIds.push(...list.map((f) => f.id));
  }

  const items: CompletenessItem[] = args.criteria.map((c) => {
    const matched = byCode.get(c.code) ?? [];
    const fileIds = matched.map((f) => f.id);

    // 파일이 없으면 진술을 본다. 파일과 진술이 함께 있으면 파일이 이긴다 —
    // "해당 없음"이라 해 놓고 서류가 올라온 경우, 실물이 판단 근거다.
    if (matched.length === 0) {
      const decl = declByCode.get(c.code);
      if (decl) {
        return {
          code: c.code,
          label: c.label,
          required: c.required,
          status: decl.kind === "deferred" ? "deferred" : "declared",
          fileIds,
          reason:
            decl.reason ||
            (decl.kind === "deferred"
              ? "법인 설립 후 제출 예정"
              : "해당 없음으로 응답(사유 미기재)"),
        };
      }
      return {
        code: c.code,
        label: c.label,
        required: c.required,
        status: c.required ? "missing" : "na",
        fileIds,
        reason: c.required ? "제출되지 않았습니다." : "선택 항목 — 미제출",
      };
    }

    // 같은 항목에 여러 파일이 붙으면 **가장 좋은 쪽**으로 판정한다. 분할 스캔이나
    // 구버전과 최신본이 함께 올라오는 일이 흔한데, 구버전 때문에 만료로 떨어지면
    // 실제로는 충족인 기업이 탈락한다.
    if (matched.some((f) => f.readable)) {
      const readable = matched.filter((f) => f.readable);

      if (c.maxAgeDays > 0) {
        const dated = readable.filter((f) => f.issuedDate || f.asOfDate);
        if (dated.length === 0) {
          return {
            code: c.code,
            label: c.label,
            required: c.required,
            status: "undated",
            fileIds,
            reason: `발급일을 읽지 못했습니다(${c.maxAgeDays}일 이내 발급본이어야 함).`,
          };
        }
        const ages = dated.map((f) =>
          daysBetween((f.issuedDate ?? f.asOfDate)!, now),
        );
        const freshest = Math.min(...ages.filter((n) => !Number.isNaN(n)));
        if (Number.isFinite(freshest) && freshest > c.maxAgeDays) {
          return {
            code: c.code,
            label: c.label,
            required: c.required,
            status: "stale",
            fileIds,
            reason: `가장 최신본이 ${freshest}일 전 발급입니다(기준 ${c.maxAgeDays}일).`,
          };
        }
      }

      if (readable.every((f) => f.confidence === "low")) {
        return {
          code: c.code,
          label: c.label,
          required: c.required,
          status: "uncertain",
          fileIds,
          reason: "AI 분류 신뢰도가 낮습니다 — 맞는 서류인지 확인해 주세요.",
        };
      }

      return {
        code: c.code,
        label: c.label,
        required: c.required,
        status: "ok",
        fileIds,
        reason: "",
      };
    }

    return {
      code: c.code,
      label: c.label,
      required: c.required,
      status: "unreadable",
      fileIds,
      reason: `${matched[0].fileName} — AI 가 읽을 수 없는 형식입니다. PDF 로 다시 올려 주세요.`,
    };
  });

  const key = companyKey(args.companyName);
  const companyMismatches = args.files
    .filter((f) => {
      const dc = f.docCompany.trim();
      if (!dc || !key) return false;
      const dk = companyKey(dc);
      // 한쪽이 다른 쪽을 포함하면 같은 회사로 본다(약칭·영문 병기가 흔하다).
      return !dk.includes(key) && !key.includes(dk);
    })
    .map((f) => ({ fileId: f.id, docCompany: f.docCompany.trim() }));

  // deferred 는 분모에서 뺀다 — 법인 설립 전이라 발급 자체가 불가능한 서류를
  // 요구하면 설립 준비 중인 기업이 항상 탈락한다.
  const deferred = items.filter((i) => i.required && i.status === "deferred");
  const required = items.filter((i) => i.required && i.status !== "deferred");
  const requiredTotal = required.length;
  const declared = required.filter((i) => i.status === "declared");
  const requiredMet = required.filter(
    (i) => i.status === "ok" || i.status === "declared",
  ).length;

  const blocking = required.filter(
    (i) => i.status === "missing" || i.status === "unreadable",
  );
  const soft = required.filter(
    (i) => i.status === "stale" || i.status === "undated" || i.status === "uncertain",
  );

  let verdict: Verdict;
  let summary: string;
  if (blocking.length > 0) {
    verdict = "fail";
    summary = `필수 서류 ${requiredTotal}종 중 ${blocking.length}종이 미비합니다 — ${blocking
      .map((i) => i.label)
      .join(", ")}. 보완 전에는 리스크 판정을 돌리지 않습니다.`;
  } else if (soft.length > 0) {
    verdict = "hold";
    summary = `필수 항목 ${requiredTotal}종에 모두 응답했으나 ${soft.length}종에 확인이 필요합니다 — ${soft
      .map((i) => `${i.label}(${i.reason})`)
      .join(" / ")}`;
  } else {
    verdict = "pass";
    summary = `필수 항목 ${requiredTotal}종에 모두 응답·유효합니다.`;
  }

  // 진술은 '응답'이지 '검증'이 아니다. 몇 종이 서류 없이 통과했는지 요약에
  // 드러내지 않으면, 투심에서 '필수 전부 제출'로 읽힌다.
  if (declared.length > 0) {
    summary += ` 이 중 ${declared.length}종은 서류가 아니라 회사의 '해당 없음' 진술로 응답한 항목입니다(${declared
      .map((i) => i.label)
      .join(", ")}) — 리스크 판정에서 자기확약으로 다룹니다.`;
  }
  if (deferred.length > 0) {
    summary += ` 법인 설립 후 제출 예정인 ${deferred.length}종(${deferred
      .map((i) => i.label)
      .join(", ")})은 필수 집계에서 제외했습니다.`;
  }

  if (companyMismatches.length > 0) {
    summary += ` ⚠ 문서상 회사명이 다른 파일이 ${companyMismatches.length}건 있습니다(${companyMismatches
      .map((m) => m.docCompany)
      .join(", ")}) — 다른 회사 서류가 섞였는지 확인하세요.`;
  }

  return {
    verdict,
    summary,
    items,
    requiredMet,
    requiredTotal,
    unmatchedFileIds,
    companyMismatches,
  };
}
