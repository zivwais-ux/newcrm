"use client";

import Link from "next/link";
import { Stat } from "@/components/business/stat";
import { CalendarCheck, Repeat, UploadSimple } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Ltr } from "@/components/ui/ltr";
import { formatCurrency, formatNumber, plural } from "@/lib/utils";
import type { RepeatData } from "@/lib/components/loaders";
import { WhatsAppButton } from "@/components/business/whatsapp-button";
import { useTerms } from "@/components/layout/workspace-provider";
import { CreateTaskButton, ListRow, SectionLabel, type ViewProps } from "../shared";
import { CustomerLink } from "../workspace-filters";

export function RepeatCustomersView({ data, currency }: ViewProps<RepeatData>) {
  const { stats, overdue, oneTime } = data;
  const t = useTerms();
  const repeatShare = stats.buyers ? (stats.repeat / stats.buyers) * 100 : 0;

  if (!stats.buyers)
    return (
      <EmptyState
        compact
        icon={<Repeat />}
        title={data.scopedTo ? `עדיין אין קונים של ${data.scopedTo}` : "עדיין אין היסטוריית קניות"}
        description={`כאן תראה כמה מה${t.customers} חוזרים לקנות שוב, מי מהקבועים איחר לחזור, ומי קנה פעם אחת וכדאי להזמין אותו שוב. כל זה מתוך ה${t.sales} ששולמו.`}
        action={
          data.scopedTo ? undefined : (
            <Button asChild size="sm">
              <Link href="/data/import">
                <UploadSimple />
                העלה קובץ {t.sales}
              </Link>
            </Button>
          )
        }
      />
    );

  return (
    <div className="space-y-5">
      {data.scopedTo && <p className="-mb-2 text-xs font-medium text-brand">{t.customers} חוזרים עבור: {data.scopedTo}</p>}
      <div className="grid grid-cols-3 gap-4">
        <Stat label="אחוז חוזרים" value={<Ltr>{stats.repeat_rate}%</Ltr>} hint={`מתוך ${plural(stats.buyers, "קונה", "קונים", "קונה אחד")}`} />
        <Stat
          label={`${t.customers} חוזרים`}
          value={formatNumber(stats.repeat)}
          hint={stats.avg_purchases_repeat ? `בממוצע ${formatNumber(stats.avg_purchases_repeat)} קניות לכל אחד מהם` : undefined}
        />
        <Stat label="קנו פעם אחת" value={formatNumber(stats.first_time)} />
      </div>
      <div>
        <div className="flex h-2 overflow-hidden rounded-sm bg-muted" role="img" aria-label={`${Math.round(repeatShare)}% ${t.customers} חוזרים`}>
          <div className="h-full bg-chart-1" style={{ width: `${repeatShare}%` }} />
          <div className="h-full w-0.5 bg-surface" />
        </div>
        <div className="mt-1.5 flex justify-between text-[11px] text-muted-foreground">
          <span>
            חוזרים · <Ltr>{Math.round(repeatShare)}%</Ltr>
          </span>
          <span>
            פעם אחת · <Ltr>{Math.round(100 - repeatShare)}%</Ltr>
          </span>
        </div>
      </div>

      <div>
        <SectionLabel className="mb-1">
          בדרך כלל חוזרים, אבל עוד לא חזרו · <span className="text-foreground num">{formatNumber(stats.overdue)}</span>
          {data.scopedTo && <span className="font-normal"> · לפי קצב הקנייה הכללי</span>}
        </SectionLabel>
        {overdue.length === 0 ? (
          <EmptyState
            compact
            icon={<CalendarCheck />}
            title="כולם בזמן"
            description={`${t.customer} קבוע (3 קניות ומעלה) שעבר אצלו הרבה יותר זמן מהרגיל יופיע כאן, ותוכל לשלוח לו WhatsApp או ליצור משימה לחזור אליו.`}
          />
        ) : (
          <div>
            {overdue.map((c) => (
              <ListRow key={c.id}>
                <div className="min-w-0 flex-1">
                  <CustomerLink id={c.id} className="block max-w-full truncate text-start text-sm font-medium hover:underline cursor-pointer">
                    {c.name}
                  </CustomerLink>
                  <p className="truncate text-xs text-muted-foreground">
                    בדרך כלל כל {plural(c.median_interval_days, "יום", "ימים")} · לא קנה {plural(c.days_since, "יום", "ימים")} · סה״כ{" "}
                    <Ltr>{formatCurrency(c.total_revenue, currency)}</Ltr>
                  </p>
                </div>
                <WhatsAppButton phone={c.phone} name={c.name} customerId={c.id} service={data.scopedTo} template="לא ראינו אותך מזמן" />
                <CreateTaskButton customerId={c.id} customerName={c.name} title={`להזמין את ${c.name} לחזור`} label="משימה" />
              </ListRow>
            ))}
          </div>
        )}
      </div>

      {oneTime.length > 0 && (
        <div>
          <SectionLabel className="mb-1">
            קנו פעם אחת — כדאי להזמין לחזור
            {data.oneTimeTotal !== null && (
              <>
                {" "}· <span className="text-foreground num">{formatNumber(data.oneTimeTotal)}</span>
              </>
            )}
          </SectionLabel>
          {oneTime.map((c) => (
            <ListRow key={c.id}>
              <div className="min-w-0 flex-1">
                <CustomerLink id={c.id} className="block max-w-full truncate text-start text-sm font-medium hover:underline cursor-pointer">
                  {c.name}
                </CustomerLink>
                <p className="truncate text-xs text-muted-foreground">
                  קנה לפני {plural(c.days_since, "יום", "ימים")} · <Ltr>{formatCurrency(c.total_revenue, currency)}</Ltr>
                </p>
              </div>
              <WhatsAppButton phone={c.phone} name={c.name} customerId={c.id} service={data.scopedTo} template="לא ראינו אותך מזמן" />
              <CreateTaskButton customerId={c.id} customerName={c.name} title={`להזמין את ${c.name} לקנות שוב`} label="משימה" />
            </ListRow>
          ))}
        </div>
      )}
    </div>
  );
}
