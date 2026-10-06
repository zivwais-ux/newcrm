"use client";

import { Stat } from "@/components/business/stat";
import { CalendarCheck } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { Ltr } from "@/components/ui/ltr";
import { formatCurrency, formatNumber, plural } from "@/lib/utils";
import type { RepeatData } from "@/lib/components/loaders";
import { WhatsAppButton } from "@/components/business/whatsapp-button";
import { CreateTaskButton, ListRow, SectionLabel, type ViewProps } from "../shared";
import { CustomerLink } from "../workspace-filters";

export function RepeatCustomersView({ data, currency }: ViewProps<RepeatData>) {
  const { stats, overdue } = data;
  const repeatShare = stats.buyers ? (stats.repeat / stats.buyers) * 100 : 0;
  return (
    <div className="space-y-5">
      {data.scopedTo && <p className="-mb-2 text-xs font-medium text-brand">לקוחות חוזרים עבור: {data.scopedTo}</p>}
      <div className="grid grid-cols-3 gap-4">
        <Stat label="אחוז חוזרים" value={<Ltr>{stats.repeat_rate}%</Ltr>} />
        <Stat label="לקוחות חוזרים" value={formatNumber(stats.repeat)} />
        <Stat label="קנו פעם אחת" value={formatNumber(stats.first_time)} />
      </div>
      <div>
        <div className="flex h-2 overflow-hidden rounded-sm bg-muted" role="img" aria-label={`${Math.round(repeatShare)}% לקוחות חוזרים`}>
          <div className="h-full bg-chart-1" style={{ width: `${repeatShare}%` }} />
          <div className="h-full w-0.5 bg-surface" />
        </div>
        <div className="mt-1.5 flex justify-between text-[11px] text-muted-foreground">
          <span>חוזרים · <Ltr>{Math.round(repeatShare)}%</Ltr></span>
          <span>פעם אחת · <Ltr>{Math.round(100 - repeatShare)}%</Ltr></span>
        </div>
      </div>
      <div>
        <SectionLabel className="mb-1">
          בדרך כלל חוזרים, אבל עוד לא חזרו · <span className="text-foreground tabular">{stats.overdue}</span>
        </SectionLabel>
        {overdue.length === 0 ? (
          <EmptyState compact icon={<CalendarCheck />} title="כולם בזמן" description="אין לקוחות קבועים שאיחרו לחזור. כשמישהו יאחר, הוא יופיע כאן ותוכל ליצור משימה לחזור אליו." />
        ) : (
          <div>
            {overdue.map((c) => (
              <ListRow key={c.id}>
                <div className="min-w-0 flex-1">
                  <CustomerLink id={c.id} className="block max-w-full truncate text-start text-sm font-medium hover:underline cursor-pointer">
                    {c.name}
                  </CustomerLink>
                  <p className="truncate text-xs text-muted-foreground">
                    בדרך כלל כל {plural(c.median_interval_days, "יום", "ימים")} · לא הגיע {plural(c.days_since, "יום", "ימים")} · סה״כ <Ltr>{formatCurrency(c.total_revenue, currency)}</Ltr>
                  </p>
                </div>
                <WhatsAppButton phone={c.phone} name={c.name} customerId={c.id} template="לא ראינו אותך מזמן" />
                <CreateTaskButton customerId={c.id} customerName={c.name} title={`להזמין את ${c.name} לחזור`} label="משימה" />
              </ListRow>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
