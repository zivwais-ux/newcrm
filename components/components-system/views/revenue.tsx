"use client";

import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BarChart3, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Stat } from "@/components/business/stat";
import { EmptyState } from "@/components/ui/empty-state";
import { Ltr } from "@/components/ui/ltr";
import { formatCurrency, formatMonth, pctChange, plural } from "@/lib/utils";
import { RANGE_PRESETS, type CompareOption } from "@/lib/analytics/dates";
import type { RevenueData } from "@/lib/components/loaders";
import { useConfigUpdater, type ViewProps } from "../shared";
import { useWorkspaceFilters } from "../workspace-filters";
import { cn } from "@/lib/utils";

const RANGE_CHOICES = ["30d", "90d", "6m", "12m", "ytd", "all"] as const;

/** "לעומת …" labels for the comparison select. */
const COMPARE_LABELS: Record<CompareOption, string> = {
  previous_period: "התקופה הקודמת",
  previous_month: "החודש הקודם",
  previous_quarter: "הרבעון הקודם",
  previous_year: "השנה שעברה",
};

function monthLabel(iso: string) {
  return formatMonth(iso.slice(0, 7) + "-01");
}

/** /transactions link for one calendar month ("yyyy-mm-…"). */
function monthHref(iso: string, service: string | null) {
  const [y, m] = iso.slice(0, 7).split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const ym = iso.slice(0, 7);
  const q = service && service !== "ללא שירות" ? `&q=${encodeURIComponent(service)}` : "";
  return `/transactions?from=${ym}-01&to=${ym}-${String(last).padStart(2, "0")}${q}`;
}

export function RevenueView({ data, config, instanceId, currency }: ViewProps<RevenueData>) {
  const { update, pending } = useConfigUpdater(instanceId);
  const router = useRouter();
  const { toggle } = useWorkspaceFilters();
  const { summary, monthly, byService } = data;
  const change = pctChange(summary.total, summary.compare_total);
  const mtdChange = pctChange(summary.this_month, summary.last_month_to_date);
  const maxService = Math.max(1, ...byService.filter((s) => !s.other).map((s) => s.revenue));
  // The current month is incomplete — plotting it would look like a collapse. KPIs cover month-to-date.
  const currentMonth = data.today.slice(0, 7);
  const trend = monthly.length > 2 ? monthly.filter((m) => m.month.slice(0, 7) !== currentMonth) : monthly;
  const compareLabel = COMPARE_LABELS[(config.compare as CompareOption) ?? "previous_year"] ?? COMPARE_LABELS.previous_year;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <Select value={config.range} onValueChange={(v) => update({ range: v })} disabled={data.rangeFromWorkspace}>
          <SelectTrigger size="sm" className="w-auto min-w-36" aria-label="טווח תאריכים" title={data.rangeFromWorkspace ? "משתמש בטווח התאריכים של כל המסך" : undefined}>
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
          <SelectTrigger size="sm" className="w-auto min-w-40" aria-label="השוואה">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(COMPARE_LABELS).map(([k, label]) => (
              <SelectItem key={k} value={k}>
                לעומת {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {pending && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
        {data.rangeFromWorkspace && <span className="text-xs text-muted-foreground">טווח של כל המסך: {RANGE_PRESETS[data.rangePreset]}</span>}
        {data.service && <span className="text-xs font-medium text-brand">מוצג רק: {data.service}</span>}
      </div>

      <div className="grid grid-cols-2 gap-x-4 gap-y-5 md:grid-cols-4">
        <Stat label="הכנסות בטווח" value={<Ltr>{formatCurrency(summary.total, currency)}</Ltr>} delta={change} hint={`לעומת ${compareLabel}`} />
        <Stat label="החודש" value={<Ltr>{formatCurrency(summary.this_month, currency)}</Ltr>} delta={mtdChange} hint="לעומת אותם ימים בחודש שעבר" />
        <Stat label="החודש הקודם" value={<Ltr>{formatCurrency(summary.last_month, currency)}</Ltr>} />
        <Stat
          label="ממוצע למכירה"
          value={<Ltr>{formatCurrency(summary.sale_count ? summary.total / summary.sale_count : 0, currency)}</Ltr>}
          hint={`${plural(summary.sale_count, "מכירה", "מכירות", "מכירה אחת")} ששולמו`}
        />
      </div>
      {summary.pending_total > 0 && (
        <p className="-mt-3 text-xs text-muted-foreground">
          ממתין לתשלום: <Ltr className="tabular">{formatCurrency(summary.pending_total, currency)}</Ltr> · לא נכלל בהכנסות עד שישולם ·{" "}
          <Link href="/transactions" className="font-medium hover:text-foreground hover:underline">
            למכירות ←
          </Link>
        </p>
      )}

      {summary.sale_count === 0 && summary.total === 0 ? (
        <EmptyState
          compact
          icon={<BarChart3 />}
          title="אין הכנסות בטווח התאריכים הזה"
          description="כאן יופיע גרף ההכנסות שלך לפי חודש ולפי שירות. רק מכירות ששולמו נספרות. נסה טווח תאריכים רחב יותר."
          action={
            <Button size="sm" variant="outline" onClick={() => update({ range: "all" })} disabled={data.rangeFromWorkspace}>
              הצג את כל הזמן
            </Button>
          }
        />
      ) : (
        <div className="grid gap-6 lg:grid-cols-5">
          <div className="lg:col-span-3">
            <p className="mb-3 text-xs font-medium text-muted-foreground">הכנסות לפי חודש · חודשים מלאים בלבד · לחץ על חודש כדי לראות את המכירות שלו</p>
            <div className="h-56" role="img" aria-label="גרף הכנסות לפי חודש" dir="ltr">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={trend}
                  margin={{ top: 4, right: 0, bottom: 0, left: 4 }}
                  className="cursor-pointer"
                  onClick={(state) => {
                    const i = Number(state?.activeIndex);
                    const point = Number.isInteger(i) ? trend[i] : undefined;
                    if (point) router.push(monthHref(point.month, data.service));
                  }}
                >
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
                    orientation="right"
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
                        <div dir="rtl" className="rounded-lg border bg-popover px-3 py-2 text-xs shadow-md">
                          <p className="font-medium">{formatMonth(p.month.slice(0, 7) + "-01", true)}</p>
                          <p className="mt-1 text-sm font-semibold tabular">
                            <Ltr>{formatCurrency(p.revenue, currency)}</Ltr>
                          </p>
                          <p className="text-muted-foreground tabular">
                            {plural(p.tx_count, "מכירה", "מכירות", "מכירה אחת")} · {plural(p.customers, "לקוח", "לקוחות")}
                          </p>
                          <p className="mt-1 text-muted-foreground">לחץ לרשימת המכירות</p>
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
            <p className="mb-2 text-xs font-medium text-muted-foreground">הכנסות לפי שירות / מוצר · לחץ כדי לסנן</p>
            <ul className="-mx-1.5 space-y-1">
              {byService.map((s) => {
                const selected = data.service === s.name;
                const dimmed = data.service && !selected;
                if (s.other)
                  return (
                    <li key="__other" className="px-1.5 py-1" title="כל שאר השירותים יחד">
                      <div className="mb-1 flex items-baseline justify-between gap-3 text-[13px] text-muted-foreground">
                        <span className="truncate">{s.name}</span>
                        <Ltr className="shrink-0 tabular">{formatCurrency(s.revenue, currency, true)}</Ltr>
                      </div>
                      <div className="h-1.5 rounded-sm bg-muted">
                        <div className="h-full rounded-sm bg-muted-foreground/40" style={{ width: `${Math.max(2, Math.min(100, (s.revenue / maxService) * 100))}%` }} />
                      </div>
                    </li>
                  );
                return (
                  <li key={s.name}>
                    <button
                      type="button"
                      onClick={() => toggle("service", s.name)}
                      className={cn("group w-full rounded-md px-1.5 py-1 text-start transition-colors hover:bg-muted/60 cursor-pointer", selected && "bg-brand-soft hover:bg-brand-soft", dimmed && "opacity-50")}
                      title={`${s.name}: ${formatCurrency(s.revenue, currency)} · ${plural(s.tx_count, "מכירה", "מכירות", "מכירה אחת")} — לחץ כדי לסנן את כל הכלים המחוברים`}
                      aria-pressed={selected}
                    >
                      <div className="mb-1 flex items-baseline justify-between gap-3 text-[13px]">
                        <span className={cn("truncate", selected && "font-medium text-brand")}>{s.name}</span>
                        <Ltr className="shrink-0 tabular text-muted-foreground">{formatCurrency(s.revenue, currency, true)}</Ltr>
                      </div>
                      <div className="h-1.5 rounded-sm bg-muted">
                        <div className="h-full rounded-sm bg-chart-1 transition-opacity group-hover:opacity-80" style={{ width: `${Math.max(2, (s.revenue / maxService) * 100)}%` }} />
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
