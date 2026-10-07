"use client";

import Link from "next/link";
import { Handshake, UploadSimple, X } from "@phosphor-icons/react";
import { PipelineBoard } from "@/components/business/pipeline-board";
import { useStages } from "@/components/layout/workspace-provider";
import { stageLabel } from "@/lib/stages";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Ltr } from "@/components/ui/ltr";
import { NewRecordButton } from "@/components/business/record-form";
import { Stat } from "@/components/business/stat";
import { formatCurrency, plural } from "@/lib/utils";
import type { PipelineData } from "@/lib/components/loaders";
import type { ViewProps } from "../shared";
import { useWorkspaceFilters } from "../workspace-filters";

export function SalesPipelineView({ data, currency }: ViewProps<PipelineData>) {
  const { toggle } = useWorkspaceFilters();
  const ctxStages = useStages();
  const stages = data.stages ?? ctxStages;
  if (!data.totalDeals)
    return (
      <EmptyState
        compact
        icon={<Handshake />}
        title="עדיין אין עסקאות"
        description="כאן תראה כל עסקה ובאיזה שלב היא, מהפנייה ועד הסגירה. הוסף עסקה ראשונה או העלה רשימה מקובץ."
        action={
          <>
            <NewRecordButton entity="deals" size="sm" />
            <Button asChild size="sm" variant="outline">
              <Link href="/data/import">
                <UploadSimple />
                העלה קובץ
              </Link>
            </Button>
          </>
        }
      />
    );
  const kindOf = (key: string) => stages.find((s) => s.key === key)?.kind ?? "open";
  const open = data.summary.filter((s) => kindOf(s.stage) === "open");
  const won = data.summary.find((s) => kindOf(s.stage) === "won");
  const lost = data.summary.find((s) => kindOf(s.stage) === "lost");
  const stageRow = data.stage ? data.summary.find((s) => s.stage === data.stage) : null;
  const winRate = won && lost && won.deals + lost.deals ? Math.round((won.deals / (won.deals + lost.deals)) * 100) : null;
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-3 gap-4">
        <Stat
          label="עסקאות פתוחות"
          value={<Ltr>{formatCurrency(open.reduce((s, x) => s + x.value, 0), currency)}</Ltr>}
          hint={plural(open.reduce((s, x) => s + x.deals, 0), "עסקה", "עסקאות", "עסקה אחת")}
        />
        <Stat label="נסגרו בהצלחה" value={<Ltr>{formatCurrency(won?.value ?? 0, currency)}</Ltr>} hint={plural(won?.deals ?? 0, "עסקה", "עסקאות", "עסקה אחת")} />
        <Stat label="אחוז סגירה" value={winRate === null ? "—" : <Ltr>{winRate}%</Ltr>} />
      </div>
      {data.stage && (
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span>
            מוצגות רק עסקאות בשלב <span className="font-medium text-foreground">{stageLabel(data.stage, stages)}</span>
            {stageRow && (
              <>
                {" "}
                · {plural(stageRow.deals, "עסקה", "עסקאות", "עסקה אחת")} · <Ltr>{formatCurrency(stageRow.value, currency)}</Ltr>
              </>
            )}
          </span>
          <Button size="xs" variant="ghost" onClick={() => toggle("stage", null)}>
            <X />
            הצג את כל השלבים
          </Button>
        </div>
      )}
      <PipelineBoard
        deals={data.deals}
        summary={data.summary}
        limitPerColumn={3}
        selectedStage={data.stage}
        onStageClick={(stage) => toggle("stage", stage)}
      />
      <Link href="/deals" className="inline-block text-xs font-medium text-muted-foreground hover:text-foreground">
        לכל העסקאות ←
      </Link>
    </div>
  );
}
