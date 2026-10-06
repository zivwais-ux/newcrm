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

export function DealRiskView({ data, currency }: ViewProps<DealRiskData>) {
  const [bulk, setBulk] = useState(false);
  if (!data.deals.length)
    return (
      <EmptyState
        compact
        icon={<ShieldCheck />}
        title="אין עסקאות תקועות"
        description={`בכל העסקאות הפתוחות${data.stage ? ` בשלב ${STAGE_LABELS[data.stage]}` : ""} הייתה פעילות ב-${data.idleDays} הימים האחרונים. עסקה שתיתקע תופיע כאן.`}
      />
    );
  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          <span className="font-medium text-foreground tabular">{formatNumber(data.total)}</span> עסקאות · <Ltr>{formatCurrency(data.totalValue, currency)}</Ltr> בסיכון
          {data.stage && <span className="font-medium text-brand"> · {STAGE_LABELS[data.stage]}</span>}
        </p>
        {data.ids.length > 0 ? (
          <Button
            size="xs"
            variant="outline"
            onClick={() => setBulk(true)}
            title={data.withTaskCount ? `${plural(data.withTaskCount, "עסקאות", "עסקאות", "עסקה אחת")} כבר עם משימה פתוחה — לא ניצור להן עוד אחת` : undefined}
          >
            צור משימות ({formatNumber(data.ids.length)})
          </Button>
        ) : (
          <span className="text-xs text-muted-foreground">לכולן כבר יש משימה פתוחה</span>
        )}
      </div>
      {data.deals.map((d) => (
        <ListRow key={d.id} className="items-start">
          <div className="min-w-0 flex-1 space-y-0.5">
            <p className="truncate text-sm font-medium">{d.name}</p>
            {d.customer_name && <p className="truncate text-xs text-muted-foreground">{d.customer_name}</p>}
            <p className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-muted-foreground">
              <Ltr className="font-medium text-foreground tabular">{formatCurrency(d.value, currency)}</Ltr>
              <Badge variant="outline">{STAGE_LABELS[d.stage as DealStage] ?? d.stage}</Badge>
              {d.idle && <span className="text-warning">אין פעילות כבר {plural(d.days_idle, "יום", "ימים", "יום אחד")}</span>}
              {d.pastClose && <span className="text-warning">עבר תאריך הסגירה הצפוי ({formatDate(d.expected_close)})</span>}
              {d.hasOpenTask && <Badge variant="brand">יש משימה פתוחה</Badge>}
            </p>
          </div>
          <div className="flex shrink-0 gap-0.5">
            <Button asChild size="xs" variant="ghost">
              <Link href={`/deals?deal=${d.id}`}>צפה בעסקה</Link>
            </Button>
            {!d.hasOpenTask && <CreateTaskButton dealId={d.id} customerId={d.customer_id} customerName={d.customer_name} title={`לחזור לגבי ${d.name}`} />}
          </div>
        </ListRow>
      ))}
      {bulk && <BulkTaskDialog open onOpenChange={setBulk} dealIds={data.ids} defaultTitle="לחזור לגבי העסקה" />}
    </div>
  );
}
