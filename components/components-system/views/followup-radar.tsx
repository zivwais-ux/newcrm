"use client";

import { useState } from "react";
import Link from "next/link";
import { Radar } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/business/empty-state";
import { BulkTaskDialog } from "@/components/business/bulk-task-dialog";
import { formatCurrency, relativeDays, formatDate } from "@/lib/utils";
import type { RadarData } from "@/lib/components/loaders";
import { CreateTaskButton, ListRow, SectionLabel, type ViewProps } from "../shared";

export function FollowupRadarView({ data, currency }: ViewProps<RadarData>) {
  const [bulk, setBulk] = useState(false);
  const nothing = !data.overdueTaskCount && !data.quietDealCount && !data.leadCount;
  if (nothing) return <EmptyState compact icon={Radar} title="All caught up" description="No overdue follow-ups, quiet deals or waiting leads." />;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-3 gap-2 text-center">
        {[
          { label: "Overdue follow-ups", value: data.overdueTaskCount },
          { label: "Quiet deals", value: data.quietDealCount },
          { label: "Leads waiting", value: data.leadCount },
        ].map((s) => (
          <div key={s.label} className="rounded-md border bg-surface px-2 py-2.5">
            <p className="text-lg font-semibold tabular">{s.value}</p>
            <p className="text-[11px] text-muted-foreground">{s.label}</p>
          </div>
        ))}
      </div>

      {data.overdueTasks.length > 0 && (
        <div>
          <SectionLabel className="mb-1">Overdue follow-ups</SectionLabel>
          {data.overdueTasks.map((t) => (
            <ListRow key={t.id}>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm">{t.title}</p>
                <p className="text-xs text-negative">Due {formatDate(t.due_date)}</p>
              </div>
              <Button asChild size="xs" variant="ghost">
                <Link href="/tasks">Open</Link>
              </Button>
            </ListRow>
          ))}
        </div>
      )}

      {data.quietDeals.length > 0 && (
        <div>
          <div className="mb-1 flex items-center justify-between">
            <SectionLabel>Deals without recent activity</SectionLabel>
            <Button size="xs" variant="ghost" onClick={() => setBulk(true)}>
              Create tasks ({data.quietDealCount})
            </Button>
          </div>
          {data.quietDeals.map((d) => (
            <ListRow key={d.id}>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm">{d.name}</p>
                <p className="text-xs text-muted-foreground">
                  {formatCurrency(d.value, currency)} · quiet for {d.days_idle} days
                </p>
              </div>
              <CreateTaskButton dealId={d.id} customerId={d.customer_id} customerName={d.customer_name} title={`Follow up on ${d.name}`} />
            </ListRow>
          ))}
        </div>
      )}

      {data.leads.length > 0 && (
        <div>
          <SectionLabel className="mb-1">Leads requiring attention</SectionLabel>
          {data.leads.map((l) => (
            <ListRow key={l.id}>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm">{l.name}</p>
                <p className="text-xs text-muted-foreground">
                  <span className="capitalize">{l.status}</span> · {l.source ?? "Unknown source"} · last touched {relativeDays(l.updated_at)}
                </p>
              </div>
              <CreateTaskButton title={`Contact lead ${l.name}`} />
            </ListRow>
          ))}
        </div>
      )}
      {bulk && <BulkTaskDialog open onOpenChange={setBulk} dealIds={data.quietDealIds} defaultTitle="Follow up on deal" />}
    </div>
  );
}
