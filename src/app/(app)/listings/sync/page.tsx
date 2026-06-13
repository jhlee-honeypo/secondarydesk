import Link from "next/link";
import { ArrowRight, Database } from "lucide-react";

import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatWon } from "@/lib/format";
import { getSyncPreview } from "../sync-actions";
import { ApplySyncButton } from "./_components/apply-sync-button";
import { ManualMatch } from "./_components/manual-match";

export const dynamic = "force-dynamic";

function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="p-4">
      <div className="mb-3">
        <h2 className="text-sm font-semibold">{title}</h2>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>
      {children}
    </Card>
  );
}

export default async function SyncPage() {
  const preview = await getSyncPreview();

  const nothingToDo =
    preview.funds.create.length === 0 &&
    preview.funds.update.length === 0 &&
    preview.listings.update.length === 0;

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6">
      <Link
        href="/listings/funds"
        className="text-sm text-muted-foreground hover:text-foreground"
      >
        ← 운용펀드
      </Link>

      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-1">
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <Database className="size-6 text-muted-foreground" />
            ERP 동기화
          </h1>
          <p className="text-sm text-muted-foreground">
            기존 수기 데이터를 지우지 않고, 이름으로 대조해 ERP 정보로 제자리
            갱신합니다. ERP 사실(영문명·섹터·최신단가·약정액·만기·소속조합)만
            채우고 영업 상태·자료 링크·메모는 보존합니다.
          </p>
        </div>
      </div>

      {!preview.ok ? (
        <Card className="items-center justify-center py-16 text-center">
          <p className="text-sm text-destructive">{preview.error}</p>
        </Card>
      ) : (
        <>
          <div className="flex items-center justify-between gap-4 rounded-lg border border-border bg-muted/30 p-4">
            <p className="text-sm text-muted-foreground">
              {nothingToDo
                ? "적용할 변경이 없습니다. (이미 동기화됨 또는 매칭되는 항목 없음)"
                : "아래 미리보기를 확인한 뒤 적용하세요. 적용 후 결과가 자동 갱신됩니다."}
            </p>
            <ApplySyncButton disabled={nothingToDo} />
          </div>

          {/* 운용펀드 */}
          <Section
            title={`운용펀드 — 갱신 ${preview.funds.update.length} · 신규 ${preview.funds.create.length} · 수기 유지 ${preview.funds.keepManual.length}`}
            hint="bubble_id 또는 이름으로 매칭. 매칭된 펀드는 약정액·결성연도·만기를 ERP로 갱신(약칭·상태·메모 보존)."
          >
            <div className="space-y-3 text-sm">
              {preview.funds.update.length > 0 && (
                <div>
                  <div className="mb-1 text-xs font-medium text-muted-foreground">
                    갱신 (매칭됨)
                  </div>
                  <ul className="space-y-1">
                    {preview.funds.update.map((f, i) => (
                      <li key={i} className="flex items-center gap-2">
                        <Badge variant="secondary">갱신</Badge>
                        <span>{f.currentName}</span>
                        <span className="text-xs text-muted-foreground">
                          ↔ ERP {f.erpName}
                          {f.size != null
                            ? ` · ${Math.round(f.size / 1e8)}억`
                            : ""}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {preview.funds.create.length > 0 && (
                <div>
                  <div className="mb-1 text-xs font-medium text-muted-foreground">
                    신규 추가
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {preview.funds.create.map((f, i) => (
                      <Badge key={i} variant="default">
                        + {f.name}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
              {preview.funds.keepManual.length > 0 && (
                <div>
                  <div className="mb-1 text-xs font-medium text-muted-foreground">
                    ERP에 없음 — 수기 유지(건드리지 않음)
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {preview.funds.keepManual.map((f, i) => (
                      <Badge key={i} variant="outline">
                        {f.name}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </Section>

          {/* 매물 */}
          <Section
            title={`매물 — 보정 ${preview.listings.update.length} · 미매칭 ${preview.listings.unmatched.length}`}
            hint={`매칭된 기존 매물만 ERP 사실로 보정합니다. ERP에만 있고 아직 매물로 안 넣은 회사 ${preview.listings.erpUntrackedCount}건은 추가하지 않습니다.`}
          >
            <div className="space-y-3 text-sm">
              {preview.listings.update.length > 0 && (
                <div>
                  <div className="mb-1 text-xs font-medium text-muted-foreground">
                    보정 (매칭됨)
                  </div>
                  <ul className="space-y-1">
                    {preview.listings.update.map((l, i) => (
                      <li key={i} className="flex flex-wrap items-center gap-2">
                        <Badge variant="secondary">보정</Badge>
                        <span>{l.currentName}</span>
                        <ArrowRight className="size-3 text-muted-foreground" />
                        <span className="text-muted-foreground">
                          {l.erpNameKr}
                          {l.erpNameEn ? ` (${l.erpNameEn})` : ""}
                          {l.sector ? ` · ${l.sector}` : ""}
                          {l.latestPrice != null
                            ? ` · 최신단가 ${formatWon(l.latestPrice)}원/주`
                            : ""}
                          {l.fundNames.length
                            ? ` · 조합 ${l.fundNames.join(", ")}`
                            : ""}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {preview.listings.unmatched.length > 0 && (
                <ManualMatch
                  unmatched={preview.listings.unmatched}
                  erpCompanies={preview.erpCompanies}
                />
              )}
            </div>
          </Section>
        </>
      )}
    </div>
  );
}
