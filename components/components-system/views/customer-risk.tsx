"use client";

import { useState } from "react";
import Link from "next/link";
import { ListPlus, TrendingDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Ltr } from "@/components/ui/ltr";
import { BulkTaskDialog } from "@/components/business/bulk-task-dialog";
import { formatCurrency, formatNumber, plural } from "@/lib/utils";
import type { RiskData } from "@/lib/components/loaders";
import { WhatsAppButton } from "@/components/business/whatsapp-button";
import { CreateTaskButton, ListRow, type ViewProps } from "../shared";
import { CustomerLink, useOpenCustomer } from "../workspace-filters";

type RiskRow = RiskData["customers"][number];

/** Plain-Hebrew explanation of why this customer is flagged. */
function reasonText(c: RiskRow) {
  const dropped = c.change_pct !== null && c.change_pct < 0;
  const gone = `לא קנה ולא ביקר ${plural(c.days_since, "יום", "ימים")}`;
  if (c.reason === "revenue_drop_and_inactive") return dropped ? `${gone}, וגם קנה פחות מבעבר` : gone;
  if (c.reason === "inactive") return gone;
  return "קונה פחות מבעבר";
}

/** The customers page accepts ?ids= — used to keep the service filter on "see all". Capped to keep the URL short. */
const LINK_IDS = 300;

export function CustomerRiskView({ data, currency }: ViewProps<RiskData>) {
  const open = useOpenCustomer();
  const [bulkOpen, setBulkOpen] = useState(false);
  const { threshold, drop } = data;

  if (!data.customers.length)
    return (
      <EmptyState
        compact
        icon={<TrendingDown />}
        title="אין לקוחות בסיכון"
        description={`${data.scopedTo ? `מבין הלקוחות של ${data.scopedTo}, אף אחד` : "אף לקוח"} לא נעלם ליותר מ-${threshold} ימים ולא הוריד את ההוצאה ב-${drop}% או יותר. כשזה יקרה תראה אותו כאן, ותוכל לשלוח לו WhatsApp או ליצור משימה.`}
      />
    );

  const allHref = data.scopedTo
    ? `/customers?${new URLSearchParams({ ids: data.ids.slice(0, LINK_IDS).join(","), title: `לקוחות בסיכון · ${data.scopedTo}` })}`
    : `/customers?segment=at-risk&threshold=${threshold}&drop=${drop}`;

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          <span className="font-medium text-foreground tabular">{formatNumber(data.total)}</span>{" "}
          {data.total === 1 ? "לקוח צריך" : "לקוחות צריכים"} תשומת לב{data.scopedTo ? ` · ${data.scopedTo}` : ""}
        </p>
        <div className="flex gap-0.5">
          <Button size="xs" variant="outline" onClick={() => setBulkOpen(true)}>
            <ListPlus />
            צור משימות לכולם
          </Button>
          <Button asChild size="xs" variant="ghost">
            <Link href={allHref}>הצג הכל</Link>
          </Button>
        </div>
      </div>
      {data.customers.map((c) => (
        <ListRow key={c.id} className="items-start">
          <div className="min-w-0 flex-1 space-y-0.5">
            <CustomerLink id={c.id} className="block max-w-full truncate text-start text-sm font-medium hover:underline cursor-pointer">
              {c.name}
            </CustomerLink>
            <p className="text-xs font-medium text-negative">{reasonText(c)}</p>
            <p className="flex flex-wrap gap-x-3 text-xs text-muted-foreground">
              {c.change_pct !== null && c.change_pct < 0 && (
                <span className="tabular">
                  ההוצאה ירדה ב-<Ltr>{Math.abs(c.change_pct)}%</Ltr> לעומת התקופה הקודמת
                </span>
              )}
              <span>
                קנייה ממוצעת: <Ltr>{formatCurrency(c.avg_ticket, currency)}</Ltr>
              </span>
            </p>
          </div>
          <div className="flex shrink-0 gap-0.5">
            <Button size="xs" variant="ghost" onClick={() => open(c.id)}>
              צפה בלקוח
            </Button>
            <WhatsAppButton phone={c.phone} name={c.name} customerId={c.id} service={data.scopedTo} template="לא ראינו אותך מזמן" />
            <CreateTaskButton customerId={c.id} customerName={c.name} title={`לבדוק מה שלום ${c.name}`} />
          </div>
        </ListRow>
      ))}
      {bulkOpen && (
        <BulkTaskDialog open={bulkOpen} onOpenChange={setBulkOpen} customerIds={data.ids} defaultTitle="לבדוק מה שלום הלקוח" />
      )}
    </div>
  );
}
