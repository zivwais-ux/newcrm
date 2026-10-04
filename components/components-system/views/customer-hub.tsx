"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Stat } from "@/components/business/stat";
import { formatCurrency, formatNumber, pctChange, relativeDays } from "@/lib/utils";
import type { CustomerHubData } from "@/lib/components/loaders";
import type { ViewProps } from "../shared";

const FILTERS = [
  { value: "", label: "All" },
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
  { value: "churned", label: "Churned" },
];

export function CustomerHubView({ data, currency }: ViewProps<CustomerHubData>) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const { stats, customers } = data;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-3 gap-4">
        <Stat label="Total customers" value={formatNumber(stats.total)} />
        <Stat
          label="New (30 days)"
          value={formatNumber(stats.new_30d)}
          delta={pctChange(stats.new_30d, stats.new_prev_30d)}
          hint="vs prior 30 days"
        />
        <Stat
          label="Active"
          value={formatNumber(stats.active)}
          hint={`${stats.total ? Math.round((stats.active / stats.total) * 100) : 0}% · seen in ${stats.active_days}d`}
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
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search customers…" className="h-8 pl-8 text-[13px]" />
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
            <tr className="text-left text-xs text-muted-foreground">
              <th className="px-1 pb-2 font-medium">Customer</th>
              <th className="hidden px-1 pb-2 font-medium sm:table-cell">Status</th>
              <th className="hidden px-1 pb-2 font-medium md:table-cell">Last purchase</th>
              <th className="px-1 pb-2 text-right font-medium">Revenue</th>
            </tr>
          </thead>
          <tbody>
            {customers.map((c) => (
              <tr key={c.id} className="border-t transition-colors hover:bg-muted/40">
                <td className="max-w-0 px-1 py-2">
                  <Link href={`/customers/${c.id}`} className="block truncate font-medium hover:underline">
                    {c.name}
                  </Link>
                  <span className="block truncate text-xs text-muted-foreground">{c.company ?? c.email ?? "—"}</span>
                </td>
                <td className="hidden px-1 py-2 sm:table-cell">
                  <Badge variant={c.status === "active" ? "positive" : "default"} className="capitalize">
                    {c.status}
                  </Badge>
                </td>
                <td className="hidden px-1 py-2 text-muted-foreground md:table-cell">{relativeDays(c.last_purchase)}</td>
                <td className="px-1 py-2 text-right tabular">{formatCurrency(c.revenue, currency)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <Link href="/customers" className="mt-2 inline-block px-1 text-xs font-medium text-muted-foreground hover:text-foreground">
          View all {formatNumber(stats.total)} customers →
        </Link>
      </div>
    </div>
  );
}
