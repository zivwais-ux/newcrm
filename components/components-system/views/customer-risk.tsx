"use client";

import Link from "next/link";
import { TrendingDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/business/empty-state";
import { formatCurrency } from "@/lib/utils";
import type { RiskData } from "@/lib/components/loaders";
import { CreateTaskButton, ListRow, type ViewProps } from "../shared";

export function CustomerRiskView({ data, config, currency }: ViewProps<RiskData>) {
  if (!data.customers.length)
    return (
      <EmptyState
        compact
        icon={TrendingDown}
        title="No customers at risk"
        description={`Nobody has dropped ${config.drop}% in revenue or been inactive for ${config.threshold}+ days.`}
      />
    );
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          <span className="font-medium text-foreground tabular">{data.total}</span> customers need attention
        </p>
        <Button asChild size="xs" variant="ghost">
          <Link href={`/customers?segment=at-risk&threshold=${config.threshold}&drop=${config.drop}`}>View all</Link>
        </Button>
      </div>
      {data.customers.map((c) => (
        <ListRow key={c.id} className="items-start">
          <div className="min-w-0 flex-1 space-y-0.5">
            <Link href={`/customers/${c.id}`} className="block truncate text-sm font-medium hover:underline">
              {c.name}
            </Link>
            <p className="flex flex-wrap gap-x-3 text-xs text-muted-foreground">
              {c.change_pct !== null && c.change_pct < 0 && (
                <span className="font-medium text-negative tabular">Revenue ↓ {Math.abs(c.change_pct)}%</span>
              )}
              <span>Last activity: {c.days_since} days ago</span>
              <span>Previous average: {formatCurrency(c.avg_ticket, currency)}</span>
            </p>
          </div>
          <div className="flex shrink-0 gap-0.5">
            <Button asChild size="xs" variant="ghost">
              <Link href={`/customers/${c.id}`}>View Customer</Link>
            </Button>
            <CreateTaskButton customerId={c.id} customerName={c.name} title={`Check in with ${c.name}`} />
          </div>
        </ListRow>
      ))}
    </div>
  );
}
