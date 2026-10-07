"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MagnifyingGlass, UploadSimple, UserPlus, Users } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Ltr } from "@/components/ui/ltr";
import { CUSTOMER_STATUS_LABELS, label } from "@/components/business/labels";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Stat } from "@/components/business/stat";
import { NewRecordButton } from "@/components/business/record-form";
import { useTerms } from "@/components/layout/workspace-provider";
import { WhatsAppButton } from "@/components/business/whatsapp-button";
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

/** Rows shown when not searching; the loader sends a few more so the quick search has something to find. */
const VISIBLE = 8;

export function CustomerHubView({ data, currency }: ViewProps<CustomerHubData>) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const t = useTerms();
  const { stats, customers } = data;

  /** /customers link that keeps the active service filter (as an id list the page understands). */
  const customersHref = (extra: Record<string, string> = {}) => {
    const p = new URLSearchParams();
    if (data.scopeIds && data.scopedTo) {
      p.set("ids", data.scopeIds.join(","));
      p.set("title", `${t.customers} שקנו: ${data.scopedTo}`);
    }
    for (const [k, v] of Object.entries(extra)) if (v) p.set(k, v);
    const qs = p.toString();
    return qs ? `/customers?${qs}` : "/customers";
  };

  if (!stats.total && !data.scopedTo)
    return (
      <EmptyState
        compact
        icon={<Users />}
        title={`עדיין אין ${t.customers}`}
        description={`כאן תראה את כל ה${t.customers} שלך: מי קנה לאחרונה, מי חדש ומי פעיל. הכי מהיר: העלה את הרשימה מקובץ אקסל.`}
        action={
          <Button asChild size="sm">
            <Link href="/data/import">
              <UploadSimple />
              העלה קובץ
            </Link>
          </Button>
        }
      />
    );

  const term = q.trim().toLowerCase();
  const shown = term
    ? customers.filter((c) => [c.name, c.email, c.phone, c.company].some((v) => v?.toLowerCase().includes(term)))
    : customers.slice(0, VISIBLE);

  return (
    <div className="space-y-6">
      {data.scopedTo && <p className="-mb-2 text-xs font-medium text-brand">{t.customers} שקנו: {data.scopedTo}</p>}
      <div className="grid grid-cols-3 gap-4">
        <Stat label={data.scopedTo ? "קונים" : `סה״כ ${t.customers}`} value={formatNumber(stats.total)} />
        <Stat
          label={`${t.customers} חדשים (קנייה ראשונה ב-30 יום)`}
          value={formatNumber(stats.new_30d)}
          delta={pctChange(stats.new_30d, stats.new_prev_30d)}
          hint="לעומת 30 הימים שלפני"
        />
        <Stat
          label="פעילים"
          value={formatNumber(stats.active)}
          hint={`${stats.total ? Math.round((stats.active / stats.total) * 100) : 0}% · קנו או ביקרו ב-${stats.active_days} הימים האחרונים`}
        />
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <form
          className="relative flex-1"
          role="search"
          onSubmit={(e) => {
            e.preventDefault();
            router.push(customersHref({ q: q.trim() }));
          }}
        >
          <MagnifyingGlass className="pointer-events-none absolute top-1/2 start-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="חיפוש לפי שם, טלפון או אימייל…"
            aria-label={`חיפוש ${t.customers}`}
            dir="auto"
            className="h-8 ps-8 text-[13px]"
          />
        </form>
        <div className="flex items-center gap-1">
          {FILTERS.map((f) => (
            <Link
              key={f.value}
              href={customersHref({ status: f.value })}
              className="rounded-sm px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              {f.label}
            </Link>
          ))}
          <NewRecordButton entity="customers" size="xs" variant="outline">
            <UserPlus />
            הוסף {t.customer}
          </NewRecordButton>
        </div>
      </div>

      <div className="-mx-1">
        {shown.length === 0 ? (
          <p className="px-1 py-4 text-center text-sm text-muted-foreground">
            {term ? "לא מצאנו כאן התאמה. " : `עדיין אין ${t.customers} שקנו את זה. `}
            {term && (
              <Link href={customersHref({ q: q.trim() })} className="font-medium text-foreground hover:underline">
                חפש בכל ה{t.customers} ←
              </Link>
            )}
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-start text-xs text-muted-foreground">
                <th className="px-1 pb-2 text-start font-medium">{t.customer}</th>
                <th className="hidden px-1 pb-2 text-start font-medium sm:table-cell">סטטוס</th>
                <th className="hidden px-1 pb-2 text-start font-medium md:table-cell">קנייה אחרונה</th>
                <th className="px-1 pb-2 text-end font-medium">{data.scopedTo ? `הכנסות מ${data.scopedTo}` : "הכנסות"}</th>
                <th className="w-9 px-1 pb-2">
                  <span className="sr-only">WhatsApp</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {shown.map((c) => (
                <tr key={c.id} className="border-t transition-colors hover:bg-muted/40">
                  <td className="max-w-0 px-1 py-2">
                    <CustomerLink id={c.id}>{c.name}</CustomerLink>
                    <span className="block truncate text-xs text-muted-foreground">
                      {c.company ?? (c.phone ? <Ltr>{c.phone}</Ltr> : c.email ? <Ltr>{c.email}</Ltr> : "—")}
                    </span>
                  </td>
                  <td className="hidden px-1 py-2 sm:table-cell">
                    <Badge variant={c.status === "active" ? "positive" : "default"}>{label(CUSTOMER_STATUS_LABELS, c.status)}</Badge>
                  </td>
                  <td className="hidden px-1 py-2 text-muted-foreground md:table-cell">{c.last_purchase ? relativeDays(c.last_purchase) : "עוד לא קנה"}</td>
                  <td className="px-1 py-2 text-end num">
                    <Ltr>{formatCurrency(c.revenue, currency)}</Ltr>
                  </td>
                  <td className="px-1 py-2 text-end">
                    <WhatsAppButton phone={c.phone} name={c.name} customerId={c.id} service={data.scopedTo} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 px-1">
          <Link href={customersHref()} className="text-xs font-medium text-muted-foreground hover:text-foreground">
            לכל {formatNumber(stats.total)} {data.scopedTo ? "הקונים" : `ה${t.customers}`} ←
          </Link>
          {term && shown.length > 0 && (
            <Link href={customersHref({ q: q.trim() })} className="text-xs text-muted-foreground hover:text-foreground">
              חפש &quot;{q.trim()}&quot; בכל ה{t.customers} ←
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
