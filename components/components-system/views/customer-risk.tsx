"use client";

import Link from "next/link";
import { TrendingDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Ltr } from "@/components/ui/ltr";
import { formatCurrency, formatNumber, plural } from "@/lib/utils";
import type { RiskData } from "@/lib/components/loaders";
import { WhatsAppButton } from "@/components/business/whatsapp-button";
import { CreateTaskButton, ListRow, type ViewProps } from "../shared";
import { CustomerLink, useOpenCustomer } from "../workspace-filters";

export function CustomerRiskView({ data, config, currency }: ViewProps<RiskData>) {
  const open = useOpenCustomer();
  if (!data.customers.length)
    return (
      <EmptyState
        compact
        icon={<TrendingDown />}
        title="אין לקוחות בסיכון"
        description={`${data.scopedTo ? `מבין הלקוחות של ${data.scopedTo}, אף אחד` : "אף לקוח"} לא הוריד את ההוצאה ב-${config.drop}% או נעלם ליותר מ-${config.threshold} ימים. כשזה יקרה, תראה אותו כאן.`}
      />
    );
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          <span className="font-medium text-foreground tabular">{formatNumber(data.total)}</span> לקוחות צריכים תשומת לב{data.scopedTo ? ` · ${data.scopedTo}` : ""}
        </p>
        <Button asChild size="xs" variant="ghost">
          <Link href={`/customers?segment=at-risk&threshold=${config.threshold}&drop=${config.drop}`}>הצג הכל</Link>
        </Button>
      </div>
      {data.customers.map((c) => (
        <ListRow key={c.id} className="items-start">
          <div className="min-w-0 flex-1 space-y-0.5">
            <CustomerLink id={c.id} className="block max-w-full truncate text-start text-sm font-medium hover:underline cursor-pointer">
              {c.name}
            </CustomerLink>
            <p className="flex flex-wrap gap-x-3 text-xs text-muted-foreground">
              {c.change_pct !== null && c.change_pct < 0 && (
                <span className="font-medium text-negative tabular">
                  ההוצאה ירדה ב-<Ltr>{Math.abs(c.change_pct)}%</Ltr>
                </span>
              )}
              <span>לא הגיע {plural(c.days_since, "יום", "ימים")}</span>
              <span>
                ממוצע קודם: <Ltr>{formatCurrency(c.avg_ticket, currency)}</Ltr>
              </span>
            </p>
          </div>
          <div className="flex shrink-0 gap-0.5">
            <Button size="xs" variant="ghost" onClick={() => open(c.id)}>
              צפה בלקוח
            </Button>
            <WhatsAppButton phone={c.phone} name={c.name} customerId={c.id} template="לא ראינו אותך מזמן" />
            <CreateTaskButton customerId={c.id} customerName={c.name} title={`לבדוק מה שלום ${c.name}`} />
          </div>
        </ListRow>
      ))}
    </div>
  );
}
