"use client";

import { useState } from "react";
import Link from "next/link";
import { Radar } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Ltr } from "@/components/ui/ltr";
import { LEAD_STATUS_LABELS, label } from "@/components/business/labels";
import { STAGE_NAMES } from "@/lib/components/filters";
import { BulkTaskDialog } from "@/components/business/bulk-task-dialog";
import { formatCurrency, relativeDays, formatDate, formatNumber, plural } from "@/lib/utils";
import type { RadarData } from "@/lib/components/loaders";
import { CreateTaskButton, ListRow, SectionLabel, type ViewProps } from "../shared";

export function FollowupRadarView({ data, currency }: ViewProps<RadarData>) {
  const [bulk, setBulk] = useState(false);
  const nothing = !data.overdueTaskCount && !data.quietDealCount && !data.leadCount;
  if (nothing) return (
      <EmptyState
        compact
        icon={<Radar />}
        title="אין למי לחזור כרגע"
        description="כאן יופיעו משימות באיחור, עסקאות שאף אחד לא נגע בהן ופניות שמחכות לתשובה. כרגע הכל מטופל."
      />
    );

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-3 gap-2 text-center">
        {[
          { label: "משימות באיחור", value: data.overdueTaskCount },
          { label: "עסקאות שקטות", value: data.quietDealCount },
          { label: "פניות שמחכות", value: data.leadCount },
        ].map((s) => (
          <div key={s.label} className="rounded-xl border bg-muted/30 px-2 py-3">
            <p className="text-xl font-semibold tabular">{formatNumber(s.value)}</p>
            <p className="text-[11px] text-muted-foreground">{s.label}</p>
          </div>
        ))}
      </div>

      {data.overdueTasks.length > 0 && (
        <div>
          <SectionLabel className="mb-1">משימות באיחור</SectionLabel>
          {data.overdueTasks.map((t) => (
            <ListRow key={t.id}>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm">{t.title}</p>
                <p className="text-xs text-negative">תאריך יעד: {formatDate(t.due_date)}</p>
              </div>
              <Button asChild size="xs" variant="ghost">
                <Link href="/tasks">פתח</Link>
              </Button>
            </ListRow>
          ))}
        </div>
      )}

      {data.quietDeals.length > 0 && (
        <div>
          <div className="mb-1 flex items-center justify-between">
            <SectionLabel>עסקאות בלי פעילות לאחרונה{data.stage ? ` · ${STAGE_NAMES[data.stage]}` : ""}</SectionLabel>
            <Button size="xs" variant="ghost" onClick={() => setBulk(true)}>
              צור משימות ({formatNumber(data.quietDealCount)})
            </Button>
          </div>
          {data.quietDeals.map((d) => (
            <ListRow key={d.id}>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm">{d.name}</p>
                <p className="text-xs text-muted-foreground">
                  <Ltr>{formatCurrency(d.value, currency)}</Ltr> · שקטה כבר {plural(d.days_idle, "יום", "ימים")}
                </p>
              </div>
              <CreateTaskButton dealId={d.id} customerId={d.customer_id} customerName={d.customer_name} title={`לחזור לגבי ${d.name}`} />
            </ListRow>
          ))}
        </div>
      )}

      {data.leads.length > 0 && (
        <div>
          <SectionLabel className="mb-1">פניות שמחכות לך</SectionLabel>
          {data.leads.map((l) => (
            <ListRow key={l.id}>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm">{l.name}</p>
                <p className="text-xs text-muted-foreground">
                  <span>{label(LEAD_STATUS_LABELS, l.status)}</span> · {l.source ?? "מקור לא ידוע"} · טופלה לאחרונה {relativeDays(l.updated_at)}
                </p>
              </div>
              <CreateTaskButton title={`ליצור קשר עם ${l.name}`} />
            </ListRow>
          ))}
        </div>
      )}
      {bulk && <BulkTaskDialog open onOpenChange={setBulk} dealIds={data.quietDealIds} defaultTitle="לחזור לגבי העסקה" />}
    </div>
  );
}
