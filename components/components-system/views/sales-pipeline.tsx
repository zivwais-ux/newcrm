"use client";

import Link from "next/link";
import { Handshake } from "lucide-react";
import { PipelineBoard } from "@/components/business/pipeline-board";
import { EmptyState } from "@/components/business/empty-state";
import { NewRecordButton } from "@/components/business/record-form";
import { Stat } from "@/components/business/stat";
import { formatCurrency } from "@/lib/utils";
import type { PipelineData } from "@/lib/components/loaders";
import type { ViewProps } from "../shared";

export function SalesPipelineView({ data, currency }: ViewProps<PipelineData>) {
  if (!data.deals.length)
    return (
      <EmptyState
        compact
        icon={Handshake}
        title="No deals yet"
        description="Create your first deal or import your pipeline."
        importCta
        action={<NewRecordButton entity="deals" variant="outline" />}
      />
    );
  const open = data.summary.filter((s) => s.stage !== "won" && s.stage !== "lost");
  const won = data.summary.find((s) => s.stage === "won");
  const lost = data.summary.find((s) => s.stage === "lost");
  const winRate = won && lost && won.deals + lost.deals ? Math.round((won.deals / (won.deals + lost.deals)) * 100) : null;
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-3 gap-4">
        <Stat label="Open pipeline" value={formatCurrency(open.reduce((s, x) => s + x.value, 0), currency)} hint={`${open.reduce((s, x) => s + x.deals, 0)} deals`} />
        <Stat label="Won" value={formatCurrency(won?.value ?? 0, currency)} hint={`${won?.deals ?? 0} deals`} />
        <Stat label="Win rate" value={winRate === null ? "—" : `${winRate}%`} />
      </div>
      <PipelineBoard deals={data.deals} limitPerColumn={3} />
      <Link href="/deals" className="inline-block text-xs font-medium text-muted-foreground hover:text-foreground">
        Open full pipeline →
      </Link>
    </div>
  );
}
