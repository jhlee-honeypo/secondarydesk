// IR덱 추출 — slab 분기보고에 첨부된 IR 자료(PDF)에서 회사 스토리를 구조화 추출한다.
// 서버 전용(ANTHROPIC_API_KEY 필요).
//
// registry-extract.ts / claude-extract.ts 와 같은 구조 — document 블록을 Claude 에
// 직접 넣어 tool 로 추출한다. IR덱은 절반 가까이가 텍스트 레이어 없는 디자인 PDF 라
// (실측 10곳 중 4곳) 별도 OCR 없이 비전으로 읽는다.
//
// ── 2계층 구조 ──────────────────────────────────────────────────────────────
// IR덱은 마케팅 문서다. 그래서 결과를 두 덩어리로 나눈다.
//
//   context — "이 회사가 뭘 하는가". 사업 이해·횡단 검색에 그대로 써도 되는 층.
//   claims  — "회사가 이렇게 주장했다". 실적·시장규모·조달 등 수치.
//             ⛔ 단독으로 답변에 내보내지 말 것. financial_statements /
//                quarterlyupdate 와 대조해 괴리를 드러내는 용도로만 쓴다.
//
// 실측 사례: 어느 덱은 "2023-03 사용자 1만 명"이라 적었는데 분기보고상 2024-06 이
// 9,169명이었다(시간을 거스르는 수치). claims 를 확정 정보로 다루면 이런 값이 그대로
// 답변에 나간다.

import Anthropic from "@anthropic-ai/sdk";

// registry-extract.ts 는 sonnet-4-6 을 쓰지만 IR덱은 절반 가까이가 이미지 전용
// 디자인 PDF 라(실측 10곳 중 4곳) 비전 해상도가 추출 품질을 좌우한다.
// sonnet-5 는 이미지 장변 2576px(4-6 은 1568px)을 읽는다.
const MODEL = "claude-sonnet-5";

const SYSTEM_PROMPT = [
  "You extract structured data from a Korean startup's IR deck (investor pitch deck) PDF.",
  "",
  "CRITICAL — THIS IS A MARKETING DOCUMENT, NOT AUDITED DATA:",
  "- Extract ONLY what the deck actually claims. Never infer, never fill gaps with world knowledge.",
  "- Keep the company's own framing and numbers verbatim; do not sanity-check or correct them.",
  "  If a number looks wrong (e.g. SOM larger than TAM), record it as written and say so in meta.notes.",
  "- If the deck does not state something, leave it empty. An empty field is correct and useful;",
  "  a plausible guess is a data-integrity failure.",
  "",
  "The output is split into two groups. Respect the split — it controls how the data may be used.",
  "",
  "== context — what this company does (used directly to explain the business) ==",
  "1. oneLiner: one sentence describing what this company does, in Korean. Prefer the deck's own",
  "   tagline if it states one. Max ~80 chars.",
  "2. problem: the customer problem the deck argues exists. Korean, 1-3 sentences.",
  "3. solution: how the product solves it. Korean, 1-3 sentences.",
  "4. product: concrete product/service names and what each does. Korean.",
  "5. businessModel: how it makes money (구독/수수료/라이선스/용역 etc.) with pricing if stated.",
  "6. targetCustomer: who buys. Segment, industry, B2B/B2C/B2G.",
  "7. revenueStreams: array of distinct revenue lines named in the deck. [] if none stated.",
  "8. keyCustomers: array of named customer/partner companies. [] if none named.",
  "9. competitors: array of named competitors. [] if none named.",
  "10. moat: claimed defensibility (특허/데이터/네트워크효과/규제 etc.).",
  "11. team: array of {name, role, background} for named members. [] if none.",
  "",
  "== claims — quantitative assertions (cross-checked against audited data, never quoted alone) ==",
  "12. traction: array of {metric, value, asOf, kind} — every quantitative achievement or target.",
  "    metric='MAU', value='18,143명', asOf='2026-01' (YYYY-MM or YYYY-MM-DD or '' if undated).",
  "    kind='actual' for a result the deck presents as already achieved;",
  "    kind='projection' for a target, forecast, plan, or goal.",
  "    When you cannot tell, use 'projection' — treating a forecast as a result is the worse error.",
  "    Do NOT also write '(목표)' into value; kind carries that. Keep value as the bare figure.",
  "    Include revenue/users/contracts/partnerships/certifications. Be exhaustive — this is the",
  "    field that gets compared against audited financials.",
  "13. market: {tam, sam, som, basis} — market size AS CLAIMED, each a string with the unit exactly",
  "    as written (e.g. '12조원', '$4.5B'). basis = the cited source/derivation sentence. '' if absent.",
  "14. fundingAsk: amount and round name being raised, as stated. Include pre-money valuation if",
  "    given. '' if the deck makes no ask.",
  "15. useOfFunds: how the raise would be spent.",
  "16. roadmap: array of {period, milestone} for future plans. [] if none.",
  "",
  "== companyFacts — hard identifiers, if the deck states them (cross-checked against the registry) ==",
  "17. companyFacts: {establishedDate (YYYY-MM-DD), ceo, businessRegNo, headOffice}. '' for any",
  "    the deck does not state. Do not infer these from the company name or your own knowledge.",
  "",
  "== meta ==",
  "18. deckDate: the deck's own date (YYYY-MM-DD or YYYY-MM or YYYY), from cover/footer. '' if absent.",
  "19. language: 'ko' | 'en' | 'mixed'.",
  "20. notes: anything a reviewer should know — e.g. this is a product brochure or partnership",
  "    proposal rather than an investor deck, pages unreadable, internal numbers that contradict",
  "    each other, leftover editing comments. Korean. '' if nothing notable.",
  "",
  "RULES:",
  "- All prose fields in Korean even when the deck is English. Keep proper nouns as-is.",
  "- Missing string: ''. Missing array: [].",
  "",
  "Submit via submit_ir_data tool.",
].join("\n");

const STR = { type: "string" } as const;
const STR_ARRAY = { type: "array", items: { type: "string" } } as const;

const EXTRACTION_TOOL: Anthropic.Tool = {
  name: "submit_ir_data",
  description: "Submit structured data extracted from an IR deck.",
  // strict — 스키마 준수를 API 가 보증한다. 없으면 모델이 가끔 중첩(context/claims)을
  // 무시하고 필드를 평평하게 제출해, normalize 가 전부 빈 값으로 만든다(실측 15/110).
  strict: true,
  input_schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      context: {
        type: "object",
        additionalProperties: false,
        properties: {
          oneLiner: STR,
          problem: STR,
          solution: STR,
          product: STR,
          businessModel: STR,
          targetCustomer: STR,
          revenueStreams: STR_ARRAY,
          keyCustomers: STR_ARRAY,
          competitors: STR_ARRAY,
          moat: STR,
          team: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              properties: { name: STR, role: STR, background: STR },
              required: ["name", "role", "background"],
            },
          },
        },
        required: [
          "oneLiner",
          "problem",
          "solution",
          "product",
          "businessModel",
          "targetCustomer",
          "revenueStreams",
          "keyCustomers",
          "competitors",
          "moat",
          "team",
        ],
      },
      claims: {
        type: "object",
        additionalProperties: false,
        properties: {
          traction: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                metric: STR,
                value: STR,
                asOf: STR,
                kind: { type: "string", enum: ["actual", "projection"] },
              },
              required: ["metric", "value", "asOf", "kind"],
            },
          },
          market: {
            type: "object",
            additionalProperties: false,
            properties: { tam: STR, sam: STR, som: STR, basis: STR },
            required: ["tam", "sam", "som", "basis"],
          },
          fundingAsk: STR,
          useOfFunds: STR,
          roadmap: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              properties: { period: STR, milestone: STR },
              required: ["period", "milestone"],
            },
          },
        },
        required: ["traction", "market", "fundingAsk", "useOfFunds", "roadmap"],
      },
      companyFacts: {
        type: "object",
        additionalProperties: false,
        properties: {
          establishedDate: STR,
          ceo: STR,
          businessRegNo: STR,
          headOffice: STR,
        },
        required: ["establishedDate", "ceo", "businessRegNo", "headOffice"],
      },
      meta: {
        type: "object",
        additionalProperties: false,
        properties: {
          deckDate: STR,
          language: { type: "string", enum: ["ko", "en", "mixed"] },
          notes: STR,
        },
        required: ["deckDate", "language", "notes"],
      },
    },
    required: ["context", "claims", "companyFacts", "meta"],
  },
};

export type IrTeamMember = { name: string; role: string; background: string };
/** kind — 덱이 이미 달성했다고 제시한 값(actual) vs 목표·전망(projection). 불명확하면 projection. */
export type IrTraction = {
  metric: string;
  value: string;
  asOf: string;
  kind: "actual" | "projection";
};
export type IrRoadmapItem = { period: string; milestone: string };
export type IrMarket = { tam: string; sam: string; som: string; basis: string };

/** 1계층 — "이 회사가 뭘 하는가". 사업 이해·검색에 그대로 노출해도 되는 층. */
export type IrContext = {
  oneLiner: string;
  problem: string;
  solution: string;
  product: string;
  businessModel: string;
  targetCustomer: string;
  revenueStreams: string[];
  keyCustomers: string[];
  competitors: string[];
  moat: string;
  team: IrTeamMember[];
};

/** 2계층 — "회사가 이렇게 주장했다". 단독 노출 금지, 실측치와 대조해서만 쓴다. */
export type IrClaims = {
  traction: IrTraction[];
  market: IrMarket;
  fundingAsk: string;
  useOfFunds: string;
  roadmap: IrRoadmapItem[];
};

/** 덱이 스스로 밝힌 식별 정보 — corporate_registrations 와 대조용. */
export type IrCompanyFacts = {
  establishedDate: string;
  ceo: string;
  businessRegNo: string;
  headOffice: string;
};

export type IrMeta = { deckDate: string; language: string; notes: string };

export type ExtractedIrDeck = {
  context: IrContext;
  claims: IrClaims;
  companyFacts: IrCompanyFacts;
  meta: IrMeta;
};

/** 추출 1건의 토큰 사용량 — 비용 산정·모니터링용. */
export type IrExtractUsage = { inputTokens: number; outputTokens: number };

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function strArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.map(str).filter(Boolean);
}

function objArray<T>(
  v: unknown,
  pick: (o: Record<string, unknown>) => T,
  keep: (x: T) => boolean,
): T[] {
  if (!Array.isArray(v)) return [];
  return v.map((x) => pick((x ?? {}) as Record<string, unknown>)).filter(keep);
}

function obj(v: unknown): Record<string, unknown> {
  return (v ?? {}) as Record<string, unknown>;
}

function normalize(d: Record<string, unknown>): ExtractedIrDeck {
  const c = obj(d.context);
  const cl = obj(d.claims);
  const cf = obj(d.companyFacts);
  const m = obj(d.meta);
  const mk = obj(cl.market);
  const lang = str(m.language);
  return {
    context: {
      oneLiner: str(c.oneLiner),
      problem: str(c.problem),
      solution: str(c.solution),
      product: str(c.product),
      businessModel: str(c.businessModel),
      targetCustomer: str(c.targetCustomer),
      revenueStreams: strArray(c.revenueStreams),
      keyCustomers: strArray(c.keyCustomers),
      competitors: strArray(c.competitors),
      moat: str(c.moat),
      team: objArray(
        c.team,
        (o) => ({ name: str(o.name), role: str(o.role), background: str(o.background) }),
        (x) => Boolean(x.name || x.role),
      ),
    },
    claims: {
      traction: objArray(
        cl.traction,
        (o) => ({
          metric: str(o.metric),
          value: str(o.value),
          asOf: str(o.asOf),
          // 분류가 빠지거나 이상하면 보수적으로 projection — 전망을 실적으로 읽는 쪽이 더 나쁘다.
          kind: str(o.kind) === "actual" ? ("actual" as const) : ("projection" as const),
        }),
        (x) => Boolean(x.metric || x.value),
      ),
      market: { tam: str(mk.tam), sam: str(mk.sam), som: str(mk.som), basis: str(mk.basis) },
      fundingAsk: str(cl.fundingAsk),
      useOfFunds: str(cl.useOfFunds),
      roadmap: objArray(
        cl.roadmap,
        (o) => ({ period: str(o.period), milestone: str(o.milestone) }),
        (x) => Boolean(x.period || x.milestone),
      ),
    },
    companyFacts: {
      establishedDate: str(cf.establishedDate),
      ceo: str(cf.ceo),
      businessRegNo: str(cf.businessRegNo),
      headOffice: str(cf.headOffice),
    },
    meta: {
      deckDate: str(m.deckDate),
      language: lang === "en" || lang === "mixed" ? lang : "ko",
      notes: str(m.notes),
    },
  };
}

async function runExtraction(
  fileBlock: Anthropic.ContentBlockParam,
): Promise<{ data: ExtractedIrDeck; usage: IrExtractUsage }> {
  const client = new Anthropic(); // ANTHROPIC_API_KEY env
  const response = await client.messages.create({
    model: MODEL,
    // traction 이 100건을 넘는 덱이 있어 8192 로는 잘렸다(실측 1건). 비스트리밍
    // 안전선인 16000 까지 올린다.
    max_tokens: 16000,
    thinking: { type: "disabled" },
    system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
    tools: [EXTRACTION_TOOL],
    tool_choice: { type: "tool", name: "submit_ir_data" },
    messages: [
      {
        role: "user",
        content: [
          fileBlock,
          { type: "text", text: "Extract IR deck data and submit via the tool." },
        ],
      },
    ],
  });

  const usage = {
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
  };
  // 잘린 응답은 tool_use input 이 불완전해 조용히 빈 값으로 정규화된다 — 던져서 재시도시킨다.
  if (response.stop_reason === "max_tokens")
    throw new Error(`출력 잘림 (max_tokens ${usage.outputTokens}) — 재시도 필요`);
  if (response.stop_reason === "refusal")
    throw new Error("모델이 응답을 거부함 (stop_reason=refusal)");

  for (const block of response.content) {
    if (block.type === "tool_use" && block.name === "submit_ir_data") {
      const data = normalize(block.input as Record<string, unknown>);
      // 전부 빈 결과는 정상 추출이 아니다(스키마 미준수 등). 저장하지 말고 실패시킨다.
      if (!data.context.oneLiner && data.claims.traction.length === 0)
        throw new Error("추출 결과가 비어 있음 — 스키마 미준수 의심");
      return { data, usage };
    }
  }
  throw new Error("추출 결과 없음 (tool_use 블록 누락)");
}

/** IR덱 PDF(bytes) 1건 추출. */
export async function extractFromIrFile(
  bytes: Uint8Array,
): Promise<{ data: ExtractedIrDeck; usage: IrExtractUsage }> {
  return runExtraction({
    type: "document",
    source: {
      type: "base64",
      media_type: "application/pdf",
      data: Buffer.from(bytes).toString("base64"),
    },
  });
}

/** URL 로 직접 추출 — 대용량 PDF(요청 본문 413) 폴백. 문서 한도(32MB·100p)는 그대로 적용. */
export async function extractFromIrUrl(
  url: string,
): Promise<{ data: ExtractedIrDeck; usage: IrExtractUsage }> {
  return runExtraction({ type: "document", source: { type: "url", url } });
}
