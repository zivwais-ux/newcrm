"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Search, Upload, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Ltr } from "@/components/ui/ltr";
import { CUSTOMER_STATUS_LABELS, label } from "@/components/business/labels";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Stat } from "@/components/business/stat";
import { formatCurrency, formatNumber, pctChange, relativeDays } from "@/lib/utils";
import type { CustomerHubData } from "@/lib/components/loaders";
import type { ViewProps } from "../shared";
import { CustomerLink } from "../workspace-filters";

const FILTERS = [
  { value: "", label: "הכל" },
  { value: "active", label: "פעיל" },
  { value: "inactive", label: "לא פעיל" },
  { value: "churned", label: "עזב" },
];

export function CustomerHubView({ data, currency }: ViewProps<CustomerHubData>) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const { stats, customers } = data;
  if (!stats.total && !data.scopedTo)
    return (
      <EmptyState
        compact
        icon={<Users />}
        title="עדיין אין לקוחות"
        description="כאן תראה את כל הלקוחות שלך: מי חדש, מי פעיל וכמה כל אחד הכניס. העלה את רשימת הלקוחות מקובץ אקסל."
        action={
          <Button asChild size="sm">
            <Link href="/data/import">
              <Upload />
              העלה קובץ
            </Link>
          </Button>
        }
      />
    );

  return (
    <div className="space-y-6">
      {data.scopedTo && <p className="-mb-2 text-xs font-medium text-brand">לקוחות שקנו: {data.scopedTo}</p>}
      <div className="grid grid-cols-3 gap-4">
        <Stat label={data.scopedTo ? "קונים" : "סה״כ לקוחות"} value={formatNumber(stats.total)} />
        <Stat
          label="חדשים (30 יום)"
          value={formatNumber(stats.new_30d)}
          delta={pctChange(stats.new_30d, stats.new_prev_30d)}
          hint="לעומת 30 הימים שלפני"
        />
        <Stat
          label="פעילים"
          value={formatNumber(stats.active)}
          hint={`${stats.total ? Math.round((stats.active / stats.total) * 100) : 0}% · קנו ב-${stats.active_days} הימים האחרונים`}
        />
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <form
          className="relative flex-1"
          onSubmit={(e) => {
            e.preventDefault();
            router.push(`/customers${q ? `?q=${encodeURIComponent(q)}` : ""}`);
          }}
        >
          <Search className="pointer-events-none absolute top-1/2 start-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="חיפוש לקוח…" dir="auto" className="h-8 ps-8 text-[13px]" />
        </form>
        <div className="flex gap-1">
          {FILTERS.map((f) => (
            <Link
              key={f.value}
              href={f.value ? `/customers?status=${f.value}` : "/customers"}
              className="rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              {f.label}
            </Link>
          ))}
        </div>
      </div>

      <div className="-mx-1">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-start text-xs text-muted-foreground">
              <th className="px-1 pb-2 text-start font-medium">לקוח</th>
              <th className="hidden px-1 pb-2 text-start font-medium sm:table-cell">סטטוס</th>
              <th className="hidden px-1 pb-2 text-start font-medium md:table-cell">קנייה אחרונה</th>
              <th className="px-1 pb-2 text-end font-medium">הכנסות</th>
            </tr>
          </thead>
          <tbody>
            {customers.map((c) => (
              <tr key={c.id} className="border-t transition-colors hover:bg-muted/40">
                <td className="max-w-0 px-1 py-2">
                  <CustomerLink id={c.id}>{c.name}</CustomerLink>
                  <span className="block truncate text-xs text-muted-foreground">{c.company ?? (c.email ? <Ltr>{c.email}</Ltr> : "—")}</span>
                </td>
                <td className="hidden px-1 py-2 sm:table-cell">
                  <Badge variant={c.status === "active" ? "positive" : "default"}>{label(CUSTOMER_STATUS_LABELS, c.status)}</Badge>
                </td>
                <td className="hidden px-1 py-2 text-muted-foreground md:table-cell">{relativeDays(c.last_purchase)}</td>
                <td className="px-1 py-2 text-end tabular">
                  <Ltr>{formatCurrency(c.revenue, currency)}</Ltr>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <Link href="/customers" className="mt-2 inline-block px-1 text-xs font-medium text-muted-foreground hover:text-foreground">
          לכל {formatNumber(stats.total)} הלקוחות ←
        </Link>
      </div>
    </div>
  );
}
