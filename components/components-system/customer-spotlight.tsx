"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowClockwise, ArrowUpRight, CalendarPlus, CaretLeft, CircleNotch, Envelope, ListPlus, Phone, WarningCircle } from "@phosphor-icons/react";
import { Sheet, SheetBody, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { WhatsAppButton } from "@/components/business/whatsapp-button";
import { TaskList } from "@/components/business/task-list";
import { ActivityItem } from "@/components/business/activity-list";
import { RecordFormDialog } from "@/components/business/record-form";
import { STAGE_LABELS } from "@/components/business/pipeline-board";
import type { SpotlightData, SpotlightResult } from "@/lib/components/spotlight";
import type { RecordEntity } from "@/lib/actions/records";
import { Ltr } from "@/components/ui/ltr";
import { CUSTOMER_STATUS_LABELS, label } from "@/components/business/labels";
import { formatCurrency, formatDate, formatNumber, plural } from "@/lib/utils";

/**
 * A customer, in context, without leaving the canvas. Opened from any Component
 * (?customer=<id>); every action here updates the Components behind it.
 */
export function CustomerSpotlight({ data, currency }: { data: SpotlightResult; currency: string }) {
  const close = useCloseSpotlight();
  if (data.status === "error") return <SpotlightError message={data.message} onClose={close} />;
  return <SpotlightSheet data={data} currency={currency} onClose={close} />;
}

function useCloseSpotlight() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  return () => {
    const next = new URLSearchParams(params.toString());
    next.delete("customer");
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };
}

/** "יום" in the Israel calendar: 0 → today, 1 → yesterday… */
function daysAgoText(n: number) {
  if (n <= 0) return "היום";
  if (n === 1) return "אתמול";
  if (n === 2) return "שלשום";
  return `לפני ${formatNumber(n)} ימים`;
}

/** Loading the customer failed: say so (instead of the sheet silently not opening) and offer a retry. */
function SpotlightError({ message, onClose }: { message: string; onClose: () => void }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="sm:max-w-lg">
        <SheetHeader>
          <SheetTitle className="text-xl font-bold">פרטי הלקוח</SheetTitle>
          <SheetDescription className="sr-only">שגיאה בטעינת פרטי הלקוח</SheetDescription>
        </SheetHeader>
        <SheetBody>
          <div role="alert" className="flex flex-col items-center gap-3 py-10 text-center">
            <span className="grid size-10 place-items-center rounded-full bg-negative-soft text-negative">
              <WarningCircle className="size-5" />
            </span>
            <p className="max-w-xs text-sm font-semibold">{message}</p>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" disabled={pending} onClick={() => startTransition(() => router.refresh())}>
                {pending ? <CircleNotch className="animate-spin" /> : <ArrowClockwise />}
                נסה שוב
              </Button>
              <Button size="sm" variant="ghost" onClick={onClose}>
                סגור
              </Button>
            </div>
          </div>
        </SheetBody>
      </SheetContent>
    </Sheet>
  );
}

function SpotlightSheet({ data, currency, onClose: close }: { data: SpotlightData; currency: string; onClose: () => void }) {
  const [dialog, setDialog] = useState<RecordEntity | null>(null);
  const c = data.customer;
  const money = (n: number) => formatCurrency(n, currency);

  return (
    <Sheet open onOpenChange={(o) => !o && close()}>
      <SheetContent className="sm:max-w-lg">
        <SheetHeader>
          <div className="flex items-center gap-2">
            <Badge variant={c.status === "active" ? "positive" : c.status === "churned" ? "negative" : "default"}>
              {label(CUSTOMER_STATUS_LABELS, c.status)}
            </Badge>
            {c.company && <span className="truncate text-xs text-muted-foreground">{c.company}</span>}
          </div>
          <SheetTitle className="text-xl font-bold">{c.name}</SheetTitle>
          <SheetDescription className="flex flex-wrap gap-x-4 gap-y-1">
            {c.email && (
              <a href={`mailto:${c.email}`} className="inline-flex items-center gap-1 hover:text-foreground">
                <Envelope className="size-3.5" />
                <Ltr>{c.email}</Ltr>
              </a>
            )}
            {c.phone && (
              <a href={`tel:${c.phone}`} className="inline-flex items-center gap-1 hover:text-foreground">
                <Phone className="size-3.5" />
                <Ltr>{c.phone}</Ltr>
              </a>
            )}
          </SheetDescription>
          <div className="flex flex-wrap gap-2 pt-3">
            <WhatsAppButton phone={c.phone} name={c.name} customerId={c.id} variant="button" />
            <Button size="sm" onClick={() => setDialog("tasks")}>
              <ListPlus />
              צור משימה
            </Button>
            <Button size="sm" variant="outline" onClick={() => setDialog("activities")}>
              <CalendarPlus />
              רשום פעילות
            </Button>
            <Button size="sm" variant="ghost" asChild>
              <Link href={`/customers/${c.id}`}>
                לכרטיס המלא
                <ArrowUpRight className="rtl:-scale-x-100" />
              </Link>
            </Button>
          </div>
        </SheetHeader>
        <SheetBody className="space-y-7">
          <div className="grid grid-cols-2 gap-3">
            <StatTile label="סך ההכנסות ממנו" value={<Ltr>{money(data.totalRevenue)}</Ltr>} />
            <StatTile label="מספר קניות" value={formatNumber(data.purchases)} />
            <StatTile
              label="קנייה אחרונה"
              value={data.daysSinceLastPurchase !== null ? daysAgoText(data.daysSinceLastPurchase) : "—"}
              hint={data.lastPurchase ? formatDate(data.lastPurchase) : undefined}
            />
            <StatTile label="חוזר בדרך כלל כל" value={data.usualInterval ? plural(data.usualInterval, "יום", "ימים") : "—"} />
          </div>
          {data.truncated && <p className="-mt-4 text-xs text-muted-foreground">ללקוח הזה יש הרבה מכירות — הסיכום מחושב לפי האחרונות שבהן.</p>}

          <section>
            <h3 className="mb-1 text-sm font-semibold">משימות פתוחות</h3>
            {data.tasks.length ? <TaskList tasks={data.tasks} showCustomer={false} /> : <p className="text-sm text-muted-foreground">אין משימות פתוחות ללקוח הזה.</p>}
          </section>

          {data.deals.length > 0 && (
            <section>
              <h3 className="mb-2 text-sm font-semibold">עסקאות פתוחות</h3>
              <ul className="divide-y rounded-lg border">
                {data.deals.map((d) => (
                  <li key={d.id}>
                    <Link
                      href={`/deals?deal=${d.id}`}
                      className="group flex items-center justify-between gap-3 px-3 py-2 text-sm transition-colors hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none"
                    >
                      <span className="truncate font-medium group-hover:text-brand">{d.name}</span>
                      <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
                        {STAGE_LABELS[d.stage]} · <Ltr className="font-medium text-foreground num">{money(Number(d.value))}</Ltr>
                        <CaretLeft className="size-3.5" aria-hidden />
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section>
            <h3 className="mb-2 text-sm font-semibold">קניות אחרונות</h3>
            {data.recent.length ? (
              <ul className="space-y-1.5 text-sm">
                {data.recent.map((t, i) => (
                  <li key={i} className="flex justify-between gap-3">
                    <span className="truncate">
                      {t.product_or_service ?? "קנייה"} <span className="text-xs text-muted-foreground">· {formatDate(t.date)}</span>
                    </span>
                    <Ltr className="num">{money(Number(t.amount))}</Ltr>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">עדיין אין קניות ללקוח הזה.</p>
            )}
          </section>

          <section>
            <h3 className="mb-1 text-sm font-semibold">פעילות אחרונה</h3>
            {data.activities.length ? (
              data.activities.map((a) => <ActivityItem key={a.id} activity={a} showCustomer={false} />)
            ) : (
              <p className="text-sm text-muted-foreground">עדיין לא נרשמה פעילות.</p>
            )}
          </section>
        </SheetBody>
        {dialog && (
          <RecordFormDialog
            entity={dialog}
            open
            onOpenChange={(o) => !o && setDialog(null)}
            initial={{ customer_id: c.id, ...(dialog === "tasks" ? { title: `לחזור אל ${c.name}` } : {}) }}
            labels={{ customer_id: c.name }}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}

function StatTile({ label, value, hint }: { label: string; value: React.ReactNode; hint?: React.ReactNode }) {
  return (
    <div className="min-w-0 rounded-xl border bg-muted/30 px-4 py-3">
      <p className="truncate text-[12px] text-muted-foreground">{label}</p>
      <p className="mt-1 truncate text-xl font-semibold tracking-tight num">{value}</p>
      {hint && <p className="mt-0.5 truncate text-[12px] text-muted-foreground">{hint}</p>}
    </div>
  );
}
