import Link from "next/link";
import {
  ArrowRight,
  Building2,
  Calculator,
  Compass,
  KanbanSquare,
  Landmark,
  LayoutDashboard,
  Lightbulb,
  Package,
  Stethoscope,
  type LucideIcon,
} from "lucide-react";

import { DEAL_STAGES, DEAL_STAGE_VARIANT } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type GuideSection = {
  icon: LucideIcon;
  title: string;
  href: string;
  summary: string;
  items: string[];
  tip?: string;
};

// 각 메뉴별 안내(초안) — 팀원이 처음 봐도 무엇을·어떻게 하는지 알 수 있게.
const GUIDE: GuideSection[] = [
  {
    icon: LayoutDashboard,
    title: "대시보드",
    href: "/",
    summary: "파이프라인 현황과 매물·투자사 진척을 한눈에 봅니다.",
    items: [
      "핵심 지표: 진행 중 딜 · 컨택 투자사 수 · 노출 매물/조합 기업 수 · 클로징 건수",
      "파이프라인 현황: 단계별 딜 수·예상금액 막대",
      "정체 딜: 30일 이상 같은 단계에 멈춘 딜 — 팔로업 대상",
      "매물별·투자사별 진척, 드랍 분석(드랍 사유 집계)",
    ],
    tip: "상단 운용펀드·기간 필터를 걸면 모든 지표가 그 조합 기준으로 다시 계산됩니다. 특정 조합만 볼 때 유용해요.",
  },
  {
    icon: KanbanSquare,
    title: "딜 보드",
    href: "/deals",
    summary: "매물 × 투자사 파이프라인을 칸반으로 관리합니다.",
    items: [
      "카드를 드래그해 단계를 옮기면 즉시 저장됩니다.",
      "카드는 현재 단계 진입일 기준 최신순 정렬, ‘기업소개’ 2개월 경과 카드는 음영 처리(사실상 드랍).",
      "‘딜’ 버튼으로 새 딜 생성 — 투자사(신규/기존) + 매물 복수 선택, 즐겨찾기 묶음으로 일괄 추가.",
      "단계를 ‘드랍’으로 두면 드랍 사유 입력칸이 나타납니다.",
      "여럿이 함께 써도 카드 이동이 화면에 실시간 반영되고, 카드의 단계 이력에 누가 옮겼는지 표시됩니다.",
      "딜을 다른 팀원에게 넘길 땐 딜 수정에서 담당자를 바꾸면 됩니다.",
      "필터 조합은 ‘저장된 뷰’로 재사용할 수 있습니다.",
    ],
    tip: "카드를 잘못 옮겼다면, 카드를 열어 ‘단계 이력’에서 잘못된 기록을 지우세요. 남은 최신 단계로 카드가 자동으로 되돌아갑니다.",
  },
  {
    icon: Building2,
    title: "투자사",
    href: "/investors",
    summary: "구주를 받을 투자사(매수자)와 컨택·조합을 관리합니다.",
    items: [
      "등록일 최신순 목록 · 이름/유형/담당으로 검색 · 행별 삭제.",
      "상세에서 유형·만난일자·개요 메모, 컨택(심사역)·조합(펀드) 관리.",
      "딜·미팅 입력 시 이름으로 명함을 검색하면 소속·연락처가 자동으로 채워집니다.",
      "같은 투자사를 다른 표기로 입력하면 기존 투자사 후보를 제안해 하나의 이름으로 모읍니다(중복 방지).",
    ],
    tip: "투자사를 삭제하면 소속 조합·컨택·딜·활동이 함께 사라집니다. 실수 방지를 위해, 삭제 시 투자사명을 직접 입력해야 확정됩니다.",
  },
  {
    icon: Compass,
    title: "조합 탐색",
    href: "/associations",
    summary: "투자사가 운용하는 조합을 살펴보고 투자 여력을 가늠합니다.",
    items: [
      "운용사별 조합(펀드) 목록과 결성일·만기 등 기본 정보를 확인합니다.",
      "드라이파우더(잔여 투자가능 재원) 추정으로 실제 집행 여력을 가늠합니다.",
      "구주 인수 여력이 있어 보이는 조합을 추려 딜 매칭에 활용하세요.",
    ],
  },
  {
    icon: Package,
    title: "매물",
    href: "/listings",
    summary: "우리가 매각을 주선하는 포트폴리오사(매물)입니다.",
    items: [
      "매물 목록·상세에서 회사 정보·운용펀드 연결을 관리합니다.",
      "상세의 적합도 추천으로 어울리는 투자사 조합을 찾고 1클릭으로 딜을 만들 수 있습니다.",
    ],
  },
  {
    icon: Landmark,
    title: "운용펀드",
    href: "/funds",
    summary: "우리가 운용하는 펀드(조합) — 매물의 보유 주체입니다.",
    items: [
      "운용펀드별 정보와 소속 매물을 확인합니다.",
      "sparkERP(Bubble) 연동: 동기화·미매칭 수기매칭·최신단가 반영(매일 자동).",
    ],
    tip: "대시보드·딜 보드의 운용펀드 필터가 여기 등록된 펀드를 기준으로 동작합니다.",
  },
  {
    icon: Calculator,
    title: "EXIT Simulator",
    href: "/exit-scenario",
    summary: "매각 시나리오별 회수 금액·수익률을 시뮬레이션합니다.",
    items: [
      "매각 단가·지분 등 가정을 바꿔가며 예상 회수액을 비교합니다.",
      "투자사 협의용 수치 검토에 활용하세요.",
    ],
  },
  {
    icon: Stethoscope,
    title: "재무 점검",
    href: "/financials",
    summary: "포트폴리오사의 재무제표를 분석해 건전성을 점검합니다.",
    items: [
      "재무제표(PDF·이미지)를 올리면 매출·순이익·자본 등 핵심 값이 자동으로 추출됩니다.",
      "추출 값으로 매출 추이·자본잠식 등 건전성 신호를 판정합니다.",
      "sparkERP 연동 재무 데이터도 함께 검토할 수 있습니다.",
      "AI 추출(OCR) 비용은 재무제표 1건(1개사)당 대략 $0.02~0.05(수십 원) 수준입니다.",
    ],
  },
];

// 파이프라인 진행 단계(드랍 제외) — 흐름 표시용
const FLOW = DEAL_STAGES.filter((s) => s !== "드랍");

export default function GuidePage() {
  return (
    <div className="mx-auto w-full max-w-4xl space-y-8">
      <header className="space-y-3 text-center">
        <h1 className="text-3xl font-semibold tracking-tight">
          SecondaryDesk 알아보기
        </h1>
        <p className="mx-auto max-w-2xl text-sm text-muted-foreground">
          구주(세컨더리) 매칭 워크스페이스입니다.
          <br />
          포트폴리오 매물과 투자사를 연결하고, 딜 파이프라인을 한곳에서 관리합니다.
          <br />
          처음이라면 아래 흐름과 메뉴 안내를 먼저 살펴보세요.
        </p>
      </header>

      {/* 딜 흐름 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">딜은 이렇게 흐릅니다</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-3">
            {FLOW.map((stage, i) => (
              <div key={stage} className="flex items-center gap-2">
                <span className="flex size-5 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary tabular-nums">
                  {i + 1}
                </span>
                <Badge variant={DEAL_STAGE_VARIANT[stage]}>{stage}</Badge>
                {i < FLOW.length - 1 && (
                  <ArrowRight className="size-4 text-muted-foreground/50" />
                )}
              </div>
            ))}
            <span className="ml-1 text-xs text-muted-foreground">
              · 무산되면{" "}
              <Badge variant={DEAL_STAGE_VARIANT["드랍"]}>드랍</Badge> 으로 이동(사유
              기록)
            </span>
          </div>
        </CardContent>
      </Card>

      {/* 메뉴별 안내 */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold tracking-tight">메뉴 안내</h2>
        <div className="space-y-4">
          {GUIDE.map((s) => (
            <GuideCard key={s.title} section={s} />
          ))}
        </div>
      </section>

      <p className="pb-2 text-center text-xs text-muted-foreground">
        궁금한 점이나 추가했으면 하는 기능이 있으면 관리자에게 알려주세요.
      </p>
    </div>
  );
}

function GuideCard({ section }: { section: GuideSection }) {
  const { icon: Icon, title, href, summary, items, tip } = section;
  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-foreground">
              <Icon className="size-5" />
            </span>
            <div className="space-y-0.5">
              <CardTitle className="flex items-center gap-2 text-base">
                {title}
              </CardTitle>
              <p className="text-sm text-muted-foreground">{summary}</p>
            </div>
          </div>
          <Link
            href={href}
            className="inline-flex shrink-0 items-center gap-1 text-sm text-primary hover:underline"
          >
            열기 <ArrowRight className="size-3.5" />
          </Link>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <ul className="space-y-1.5 text-sm text-muted-foreground">
          {items.map((it, i) => (
            <li key={i} className="flex gap-2">
              <span className="mt-2 size-1 shrink-0 rounded-full bg-muted-foreground/40" />
              <span>{it}</span>
            </li>
          ))}
        </ul>
        {tip && (
          <div className="flex gap-2 rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground">
            <Lightbulb className="size-4 shrink-0 text-amber-500" />
            <span>{tip}</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
