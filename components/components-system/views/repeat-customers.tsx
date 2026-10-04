"use client";

import Link from "next/link";
import { Stat } from "@/components/business/stat";
import { EmptyState } from "@/components/business/empty-state";
import { formatCurrency, formatNumber } from "@/lib/utils";
import type { RepeatData } from "@/lib/components/loaders";
import { CreateTaskButton, ListRow, SectionLabel, type ViewProps } from "../shared";

export function RepeatCustomersView({ data, currency }: ViewProps<RepeatData>) {
  const { stats, overdue } = data;
  const repeatShare = stats.buyers ? (stats.repeat / stats.buyers) * 100 : 0;
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-3 gap-4">
        <Stat label="Repeat rate" value={`${stats.repeat_rate}%`} />
        <Stat label="Repeat customers" value={formatNumber(stats.repeat)} />
        <Stat label="First-time" value={formatNumber(stats.first_time)} />
      </div>
      <div>
        <div className="flex h-2 overflow-hidden rounded-full bg-muted" role="img" aria-label={`${Math.round(repeatShare)}% repeat customers`}>
          <div className="h-full bg-chart-1" style={{ width: `${repeatShare}%` }} />
          <div className="h-full w-0.5 bg-surface" />
        </div>
        <div className="mt-1.5 flex justify-between text-[11px] text-muted-foreground">
          <span>Repeat · {Math.round(repeatShare)}%</span>
          <span>First-time · {Math.round(100 - repeatShare)}%</span>
        </div>
      </div>
      <div>
        <SectionLabel className="mb-1">
          Usually return, but haven&apos;t · <span className="text-foreground tabular">{stats.overdue}</span>
        </SectionLabel>
        {overdue.length === 0 ? (
          <EmptyState compact title="Everyone's on schedule" description="No regular customers are past their usual return date." />
        ) : (
          <div>
            {overdue.map((c) => (
              <ListRow key={c.id}>
                <div className="min-w-0 flex-1">
                  <Link href={`/customers/${c.id}`} className="block truncate text-sm font-medium hover:underline">
                    {c.name}
                  </Link>
                  <p className="truncate text-xs text-muted-foreground">
                    Usually every {c.median_interval_days} days · last seen {c.days_since} days ago · {formatCurrency(c.total_revenue, currency)} lifetime
                  </p>
                </div>
                <CreateTaskButton customerId={c.id} customerName={c.name} title={`Invite ${c.name} back`} label="Task" />
              </ListRow>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
