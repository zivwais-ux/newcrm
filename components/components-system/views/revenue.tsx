"use client";

import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Loader2 } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Stat } from "@/components/business/stat";
import { EmptyState } from "@/components/business/empty-state";
import { formatCurrency, pctChange } from "@/lib/utils";
import { COMPARE_OPTIONS, RANGE_PRESETS } from "@/lib/analytics/dates";
import type { RevenueData } from "@/lib/components/loaders";
import { useConfigUpdater, type ViewProps } from "../shared";
import { useWorkspaceFilters } from "../workspace-filters";
import { cn } from "@/lib/utils";

const RANGE_CHOICES = ["90d", "6m", "12m", "ytd", "all"] as const;

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function monthLabel(iso: string) {
  return `${MONTHS[Number(iso.slice(5, 7)) - 1]} ${iso.slice(2, 4)}`;
}

export function RevenueView({ data, config, instanceId, currency }: ViewProps<RevenueData>) {
  const { update, pending } = useConfigUpdater(instanceId);
  const { toggle } = useWorkspaceFilters();
  const { summary, monthly, byService } = data;
  const change = pctChange(summary.total, summary.compare_total);
  const mtdChange = pctChange(summary.this_month, summary.last_month_to_date);
  const maxService = Math.max(1, ...byService.map((s) => s.revenue));
  // The current month is incomplete — plotting it would look like a collapse. KPIs cover month-to-date.
  const currentMonth = new Date().toISOString().slice(0, 7);
  const trend = monthly.length > 2 ? monthly.filter((m) => m.month.slice(0, 7) !== currentMonth) : monthly;
  const compareLabel = COMPARE_OPTIONS[(config.compare as keyof typeof COMPARE_OPTIONS) ?? "previous_year"]?.toLowerCase();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <Select value={config.range} onValueChange={(v) => update({ range: v })} disabled={data.rangeFromWorkspace}>
          <SelectTrigger size="sm" className="w-auto min-w-36" aria-label="Date range" title={data.rangeFromWorkspace ? "Using the workspace date range" : undefined}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {RANGE_CHOICES.map((r) => (
              <SelectItem key={r} value={r}>
                {RANGE_PRESETS[r]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={config.compare} onValueChange={(v) => update({ compare: v })}>
          <SelectTrigger size="sm" className="w-auto min-w-40" aria-label="Comparison">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(COMPARE_OPTIONS).map(([k, label]) => (
              <SelectItem key={k} value={k}>
                vs {label.toLowerCase()}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {pending && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
        {data.rangeFromWorkspace && <span className="text-xs text-muted-foreground">Workspace range: {RANGE_PRESETS[data.rangePreset]}</span>}
        {data.service && <span className="text-xs font-medium text-brand">Showing {data.service} only</span>}
      </div>

      <div className="grid grid-cols-2 gap-x-4 gap-y-5 md:grid-cols-4">
        <Stat label="Revenue in range" value={formatCurrency(summary.total, currency)} delta={change} hint={`vs ${compareLabel}`} />
        <Stat label="This month" value={formatCurrency(summary.this_month, currency)} delta={mtdChange} hint="vs same days last month" />
        <Stat label="Previous month" value={formatCurrency(summary.last_month, currency)} />
        <Stat
          label="Avg. transaction"
          value={formatCurrency(summary.tx_count ? summary.total / summary.tx_count : 0, currency)}
          hint={`${summary.tx_count.toLocaleString("en-US")} transactions`}
        />
      </div>

      {summary.tx_count === 0 ? (
        <EmptyState compact title="No revenue in this date range" description="Try a wider date range." />
      ) : (
        <div className="grid gap-6 lg:grid-cols-5">
          <div className="lg:col-span-3">
            <p className="mb-3 text-xs font-medium text-muted-foreground">Revenue trend · complete months</p>
            <div className="h-56" role="img" aria-label="Monthly revenue trend">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={trend} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                  <defs>
                    <linearGradient id="rev-fill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.14} />
                      <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="0" />
                  <XAxis
                    dataKey="month"
                    tickFormatter={monthLabel}
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                    minTickGap={24}
                  />
                  <YAxis
                    tickFormatter={(v) => formatCurrency(v, currency, true)}
                    tickLine={false}
                    axisLine={false}
                    width={56}
                    tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                  />
                  <Tooltip
                    cursor={{ stroke: "var(--ring)", strokeWidth: 1 }}
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      const p = payload[0].payload as RevenueData["monthly"][number];
                      return (
                        <div className="rounded-md border bg-popover px-3 py-2 text-xs shadow-md">
                          <p className="font-medium">{monthLabel(p.month)}</p>
                          <p className="mt-1 tabular">{formatCurrency(p.revenue, currency)}</p>
                          <p className="text-muted-foreground tabular">
                            {p.tx_count} transactions · {p.customers} customers
                          </p>
                        </div>
                      );
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="revenue"
                    stroke="var(--chart-1)"
                    strokeWidth={2}
                    fill="url(#rev-fill)"
                    activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--surface)" }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div className="lg:col-span-2">
            <p className="mb-2 text-xs font-medium text-muted-foreground">Revenue by service / product · click to filter</p>
            <ul className="-mx-1.5 space-y-1">
              {byService.map((s) => {
                const selected = data.service === s.name;
                const dimmed = data.service && !selected;
                return (
                  <li key={s.name}>
                    <button
                      type="button"
                      onClick={() => toggle("service", s.name)}
                      className={cn("group w-full rounded-md px-1.5 py-1 text-left transition-colors hover:bg-muted/60 cursor-pointer", selected && "bg-brand-soft hover:bg-brand-soft", dimmed && "opacity-50")}
                      title={`${s.name}: ${formatCurrency(s.revenue, currency)} · ${s.tx_count} transactions — click to filter linked Components`}
                      aria-pressed={selected}
                    >
                      <div className="mb-1 flex items-baseline justify-between gap-3 text-[13px]">
                        <span className={cn("truncate", selected && "font-medium text-brand")}>{s.name}</span>
                        <span className="shrink-0 tabular text-muted-foreground">{formatCurrency(s.revenue, currency, true)}</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-muted">
                        <div className="h-full rounded-full bg-chart-1 transition-opacity group-hover:opacity-80" style={{ width: `${Math.max(2, (s.revenue / maxService) * 100)}%` }} />
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
