"use client";

import { useState } from "react";
import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Ltr } from "@/components/ui/ltr";
import { BulkTaskDialog } from "@/components/business/bulk-task-dialog";
import { STAGE_LABELS } from "@/components/business/pipeline-board";
import { formatCurrency, formatDate, formatNumber, plural } from "@/lib/utils";
import type { DealRiskData } from "@/lib/components/loaders";
import type { DealStage } from "@/types/domain";
import { CreateTaskButton, ListRow, type ViewProps } from "../shared";

export function DealRiskView({ data, config, currency }: ViewProps<DealRiskData>) {
  const [bulk, setBulk] = useState(false);
  if (!data.deals.length)
    return (
      <EmptyState
        compact
        icon={<ShieldCheck />}
        title="אין עסקאות תקועות"
        description={`בכל העסקאות הפתוחות${data.stage ? ` בשלב ${STAGE_LABELS[data.stage]}` : ""} הייתה פעילות ב-${config.idleDays} הימים האחרונים. עסקה שתיתקע תופיע כאן.`}
      />
    );
  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          <span className="font-medium text-foreground tabular">{formatNumber(data.total)}</span> עסקאות · <Ltr>{formatCurrency(data.totalValue, currency)}</Ltr> בסיכון
          {data.stage && <span className="font-medium text-brand"> · {STAGE_LABELS[data.stage]}</span>}
        </p>
        <Button size="xs" variant="outline" onClick={() => setBulk(true)}>
          צור משימות לכולן
        </Button>
      </div>
      {data.deals.map((d) => (
        <ListRow key={d.id} className="items-start">
          <div className="min-w-0 flex-1 space-y-0.5">
            <p className="truncate text-sm font-medium">{d.customer_name ?? d.name}</p>
            <p className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-muted-foreground">
              <Ltr className="font-medium text-foreground tabular">{formatCurrency(d.value, currency)}</Ltr>
              <Badge variant="outline">{STAGE_LABELS[d.stage as DealStage] ?? d.stage}</Badge>
              {d.reason === "past_close_date" ? (
                <span className="text-warning">עבר תאריך הסגירה הצפוי ({formatDate(d.expected_close)})</span>
              ) : (
                <span className="text-warning">אין פעילות כבר {plural(d.days_idle, "יום", "ימים")}</span>
              )}
            </p>
          </div>
          <div className="flex shrink-0 gap-0.5">
            <Button asChild size="xs" variant="ghost">
              <Link href={`/deals?deal=${d.id}`}>צפה בעסקה</Link>
            </Button>
            <CreateTaskButton dealId={d.id} customerId={d.customer_id} customerName={d.customer_name} title={`לחזור לגבי ${d.name}`} />
          </div>
        </ListRow>
      ))}
      {bulk && <BulkTaskDialog open onOpenChange={setBulk} dealIds={data.ids} defaultTitle="לחזור לגבי העסקה" />}
    </div>
  );
}
