"use client";

import { useState } from "react";
import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/business/empty-state";
import { BulkTaskDialog } from "@/components/business/bulk-task-dialog";
import { STAGE_LABELS } from "@/components/business/pipeline-board";
import { formatCurrency, formatDate } from "@/lib/utils";
import type { DealRiskData } from "@/lib/components/loaders";
import type { DealStage } from "@/types/domain";
import { CreateTaskButton, ListRow, type ViewProps } from "../shared";

export function DealRiskView({ data, config, currency }: ViewProps<DealRiskData>) {
  const [bulk, setBulk] = useState(false);
  if (!data.deals.length)
    return (
      <EmptyState
        compact
        icon={ShieldCheck}
        title="No deals at risk"
        description={`Every open deal${data.stage ? ` in ${STAGE_LABELS[data.stage]}` : ""} had activity in the last ${config.idleDays} days.`}
      />
    );
  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          <span className="font-medium text-foreground tabular">{data.total}</span> deals · {formatCurrency(data.totalValue, currency)} at risk
          {data.stage && <span className="font-medium text-brand"> · {STAGE_LABELS[data.stage]}</span>}
        </p>
        <Button size="xs" variant="outline" onClick={() => setBulk(true)}>
          Create tasks for all
        </Button>
      </div>
      {data.deals.map((d) => (
        <ListRow key={d.id} className="items-start">
          <div className="min-w-0 flex-1 space-y-0.5">
            <p className="truncate text-sm font-medium">{d.customer_name ?? d.name}</p>
            <p className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-muted-foreground">
              <span className="font-medium text-foreground tabular">{formatCurrency(d.value, currency)}</span>
              <Badge variant="outline">{STAGE_LABELS[d.stage as DealStage] ?? d.stage}</Badge>
              {d.reason === "past_close_date" ? (
                <span className="text-warning">Expected close passed ({formatDate(d.expected_close)})</span>
              ) : (
                <span className="text-warning">No activity for {d.days_idle} days</span>
              )}
            </p>
          </div>
          <div className="flex shrink-0 gap-0.5">
            <Button asChild size="xs" variant="ghost">
              <Link href={`/deals?deal=${d.id}`}>View Deal</Link>
            </Button>
            <CreateTaskButton dealId={d.id} customerId={d.customer_id} customerName={d.customer_name} title={`Follow up on ${d.name}`} />
          </div>
        </ListRow>
      ))}
      {bulk && <BulkTaskDialog open onOpenChange={setBulk} dealIds={data.ids} defaultTitle="Follow up on deal" />}
    </div>
  );
}
