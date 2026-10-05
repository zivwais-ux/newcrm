"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowUpRight, CalendarPlus, ListPlus, Mail, Phone } from "lucide-react";
import { Sheet, SheetBody, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Stat } from "@/components/business/stat";
import { TaskList } from "@/components/business/task-list";
import { ActivityItem } from "@/components/business/activity-list";
import { RecordFormDialog } from "@/components/business/record-form";
import { STAGE_LABELS } from "@/components/business/pipeline-board";
import type { SpotlightData } from "@/lib/components/spotlight";
import type { RecordEntity } from "@/lib/actions/records";
import { formatCurrency, formatDate, relativeDays } from "@/lib/utils";

/**
 * A customer, in context, without leaving the canvas. Opened from any Component
 * (?customer=<id>); every action here updates the Components behind it.
 */
export function CustomerSpotlight({ data, currency }: { data: SpotlightData; currency: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [dialog, setDialog] = useState<RecordEntity | null>(null);
  const c = data.customer;
  const money = (n: number) => formatCurrency(n, currency);

  function close() {
    const next = new URLSearchParams(params.toString());
    next.delete("customer");
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  return (
    <Sheet open onOpenChange={(o) => !o && close()}>
      <SheetContent className="sm:max-w-lg">
        <SheetHeader>
          <div className="flex items-center gap-2">
            <Badge variant={c.status === "active" ? "positive" : c.status === "churned" ? "negative" : "default"} className="capitalize">
              {c.status}
            </Badge>
            {c.company && <span className="truncate text-xs text-muted-foreground">{c.company}</span>}
          </div>
          <SheetTitle className="text-xl">{c.name}</SheetTitle>
          <SheetDescription className="flex flex-wrap gap-x-4 gap-y-1">
            {c.email && (
              <a href={`mailto:${c.email}`} className="inline-flex items-center gap-1 hover:text-foreground">
                <Mail className="size-3.5" />
                {c.email}
              </a>
            )}
            {c.phone && (
              <a href={`tel:${c.phone}`} className="inline-flex items-center gap-1 hover:text-foreground">
                <Phone className="size-3.5" />
                {c.phone}
              </a>
            )}
          </SheetDescription>
          <div className="flex flex-wrap gap-2 pt-3">
            <Button size="sm" onClick={() => setDialog("tasks")}>
              <ListPlus />
              Create task
            </Button>
            <Button size="sm" variant="outline" onClick={() => setDialog("activities")}>
              <CalendarPlus />
              Log activity
            </Button>
            <Button size="sm" variant="ghost" asChild>
              <Link href={`/customers/${c.id}`}>
                Full profile
                <ArrowUpRight />
              </Link>
            </Button>
          </div>
        </SheetHeader>
        <SheetBody className="space-y-7">
          <div className="grid grid-cols-2 gap-5">
            <Stat label="Total revenue" value={money(data.totalRevenue)} />
            <Stat label="Purchases" value={data.purchases} />
            <Stat label="Last purchase" value={data.lastPurchase ? relativeDays(data.lastPurchase) : "—"} hint={data.lastPurchase ? formatDate(data.lastPurchase) : undefined} />
            <Stat label="Usually returns every" value={data.usualInterval ? `${data.usualInterval} days` : "—"} />
          </div>

          <section>
            <h3 className="mb-1 text-sm font-semibold">Open tasks</h3>
            {data.tasks.length ? <TaskList tasks={data.tasks} showCustomer={false} /> : <p className="text-sm text-muted-foreground">Nothing open.</p>}
          </section>

          {data.deals.length > 0 && (
            <section>
              <h3 className="mb-2 text-sm font-semibold">Open deals</h3>
              <ul className="divide-y rounded-md border">
                {data.deals.map((d) => (
                  <li key={d.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                    <span className="truncate">{d.name}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {STAGE_LABELS[d.stage]} · <span className="font-medium text-foreground tabular">{money(d.value)}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section>
            <h3 className="mb-2 text-sm font-semibold">Recent purchases</h3>
            {data.recent.length ? (
              <ul className="space-y-1.5 text-sm">
                {data.recent.map((t, i) => (
                  <li key={i} className="flex justify-between gap-3">
                    <span className="truncate">
                      {t.product_or_service ?? "Purchase"} <span className="text-xs text-muted-foreground">· {formatDate(t.date)}</span>
                    </span>
                    <span className="tabular">{money(Number(t.amount))}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">No purchases yet.</p>
            )}
          </section>

          <section>
            <h3 className="mb-1 text-sm font-semibold">Recent activity</h3>
            {data.activities.length ? (
              data.activities.map((a) => <ActivityItem key={a.id} activity={a} showCustomer={false} />)
            ) : (
              <p className="text-sm text-muted-foreground">No activities logged.</p>
            )}
          </section>
        </SheetBody>
        {dialog && (
          <RecordFormDialog
            entity={dialog}
            open
            onOpenChange={(o) => !o && setDialog(null)}
            initial={{ customer_id: c.id, ...(dialog === "tasks" ? { title: `Follow up with ${c.name}` } : {}) }}
            labels={{ customer_id: c.name }}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}
