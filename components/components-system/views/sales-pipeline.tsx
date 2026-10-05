"use client";

import Link from "next/link";
import { Handshake } from "lucide-react";
import { PipelineBoard } from "@/components/business/pipeline-board";
import { Upload } from "lucide-react";
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
  if (!data.deals.length)
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
                <Upload />
                העלה קובץ
              </Link>
            </Button>
          </>
        }
      />
    );
  const open = data.summary.filter((s) => s.stage !== "won" && s.stage !== "lost");
  const won = data.summary.find((s) => s.stage === "won");
  const lost = data.summary.find((s) => s.stage === "lost");
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
      <PipelineBoard deals={data.deals} limitPerColumn={3} selectedStage={data.stage} onStageClick={(stage) => toggle("stage", stage)} />
      <Link href="/deals" className="inline-block text-xs font-medium text-muted-foreground hover:text-foreground">
        לכל העסקאות ←
      </Link>
    </div>
  );
}
