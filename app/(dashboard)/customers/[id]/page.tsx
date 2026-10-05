import { notFound } from "next/navigation";
import Link from "next/link";
import { ChevronLeft, Mail, Phone, Building2, CalendarClock, ListChecks, Receipt, Handshake } from "lucide-react";
import { z } from "zod";
import { requireOrg } from "@/lib/supabase/server";
import { PageContainer } from "@/components/layout/page";
import { TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ProfileTabs } from "@/components/business/profile-tabs";
import { CustomerActions } from "@/components/business/customer-actions";
import { ActivityItem } from "@/components/business/activity-list";
import { TaskList } from "@/components/business/task-list";
import { EmptyState } from "@/components/business/empty-state";
import { Stat } from "@/components/business/stat";
import { STAGE_LABELS } from "@/components/business/pipeline-board";
import { formatCurrency, formatDate, formatNumber, plural, relativeDays } from "@/lib/utils";
import { Ltr } from "@/components/ui/ltr";
import { CUSTOMER_STATUS_LABELS, TRANSACTION_STATUS_LABELS, TRANSACTION_TYPE_LABELS, label } from "@/components/business/labels";
import type { Activity, Customer, Deal, Task, Transaction } from "@/types/domain";

export default async function CustomerProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) notFound();
  const { supabase, org } = await requireOrg();

  const { data: customer } = await supabase.from("customers").select("*").eq("id", id).eq("organization_id", org.id).maybeSingle();
  if (!customer) notFound();
  const c = customer as Customer;

  const [txRes, actRes, dealRes, taskRes, allTx] = await Promise.all([
    supabase.from("transactions").select("*").eq("customer_id", id).order("date", { ascending: false }).limit(100),
    supabase.from("activities").select("*").eq("customer_id", id).order("date", { ascending: false }).limit(50),
    supabase.from("deals").select("*").eq("customer_id", id).order("updated_at", { ascending: false }),
    supabase.from("tasks").select("*, deals(name)").eq("customer_id", id).order("status").order("due_date"),
    supabase.from("transactions").select("amount, date, type, status, product_or_service").eq("customer_id", id).order("date"),
  ]);
  const transactions = (txRes.data ?? []) as Transaction[];
  const activities = (actRes.data ?? []) as Activity[];
  const deals = (dealRes.data ?? []) as Deal[];
  const tasks = (taskRes.data ?? []) as Task[];
  const history = (allTx.data ?? []) as Pick<Transaction, "amount" | "date" | "type" | "status" | "product_or_service">[];

  const value = (t: (typeof history)[number]) => (t.status === "cancelled" ? 0 : t.type === "refund" || t.status === "refunded" ? -Math.abs(Number(t.amount)) : Number(t.amount));
  const totalRevenue = history.reduce((s, t) => s + value(t), 0);
  const purchases = history.filter((t) => t.type !== "refund" && t.status !== "cancelled");
  const gaps = purchases.slice(1).map((t, i) => (new Date(t.date).getTime() - new Date(purchases[i].date).getTime()) / 86_400_000);
  const sortedGaps = [...gaps].sort((a, b) => a - b);
  const usualInterval = sortedGaps.length ? Math.round(sortedGaps[Math.floor(sortedGaps.length / 2)]) : null;
  const lastPurchase = purchases.at(-1)?.date ?? null;
  const byService = new Map<string, number>();
  for (const t of purchases) byService.set(t.product_or_service ?? "אחר", (byService.get(t.product_or_service ?? "אחר") ?? 0) + Number(t.amount));
  const topServices = [...byService.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
  const openTasks = tasks.filter((t) => t.status === "open");
  const segment = typeof c.custom_fields?.segment === "string" ? (c.custom_fields.segment as string) : null;
  const customFields = Object.entries(c.custom_fields ?? {}).filter(([, v]) => typeof v === "string" || typeof v === "number");
  const money = (n: number) => formatCurrency(n, org.currency);

  return (
    <PageContainer>
      <Link href="/customers" className="mb-5 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
        <ChevronLeft className="size-3.5 rtl:-scale-x-100" />
        לקוחות
      </Link>

      <div className="mb-8 flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-2">
          <h1 className="text-[26px] font-bold tracking-tight">{c.name}</h1>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Badge variant={c.status === "active" ? "positive" : c.status === "churned" ? "negative" : "default"} >
              לקוח {label(CUSTOMER_STATUS_LABELS, c.status)}
            </Badge>
            {segment && <Badge variant="outline">{segment}</Badge>}
          </div>
          <p className="text-lg font-medium tabular">
            <Ltr>{money(totalRevenue)}</Ltr> <span className="text-sm font-normal text-muted-foreground">סה״כ הכנסות</span>
          </p>
        </div>
        <CustomerActions customer={c} />
      </div>

      <ProfileTabs
        tabs={[
          { value: "overview", label: "סקירה" },
          { value: "transactions", label: "מכירות", count: history.length },
          { value: "activities", label: "פעילות", count: activities.length },
          { value: "deals", label: "עסקאות", count: deals.length },
          { value: "tasks", label: "משימות", count: openTasks.length },
        ]}
      >
        <TabsContent value="overview">
          <div className="grid gap-8 lg:grid-cols-3">
            <div className="space-y-8 lg:col-span-2">
              <div className="grid grid-cols-2 gap-5 rounded-xl border bg-surface p-5 shadow-sm sm:grid-cols-4">
                <Stat label="קניות" value={formatNumber(purchases.length)} />
                <Stat label="קנייה ממוצעת" value={<Ltr>{money(purchases.length ? totalRevenue / purchases.length : 0)}</Ltr>} />
                <Stat label="קנייה אחרונה" value={lastPurchase ? relativeDays(lastPurchase) : "—"} hint={lastPurchase ? formatDate(lastPurchase) : undefined} />
                <Stat label="חוזר בדרך כלל כל" value={usualInterval ? plural(usualInterval, "יום", "ימים") : "—"} />
              </div>
              {topServices.length > 0 && (
                <div>
                  <h3 className="mb-3 text-sm font-semibold">מה הוא קונה</h3>
                  <ul className="space-y-2">
                    {topServices.map(([name, amount]) => (
                      <li key={name} className="flex items-center justify-between text-sm">
                        <span>{name}</span>
                        <Ltr className="tabular text-muted-foreground">{money(amount)}</Ltr>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <div>
                <h3 className="mb-2 text-sm font-semibold">פעילות אחרונה</h3>
                {activities.length ? (
                  activities.slice(0, 4).map((a) => <ActivityItem key={a.id} activity={a} showCustomer={false} />)
                ) : (
                  <p className="text-sm text-muted-foreground">עוד לא נרשמה פעילות.</p>
                )}
              </div>
            </div>
            <aside className="space-y-6">
              <div className="space-y-3 rounded-xl border bg-surface p-5 text-sm shadow-sm">
                <h3 className="font-semibold">פרטי קשר</h3>
                <p className="flex items-center gap-2 text-zinc-700">
                  <Mail className="size-4 text-muted-foreground" />
                  {c.email ? (
                    <a href={`mailto:${c.email}`} dir="ltr" className="truncate hover:underline">
                      {c.email}
                    </a>
                  ) : (
                    "—"
                  )}
                </p>
                <p className="flex items-center gap-2 text-zinc-700">
                  <Phone className="size-4 text-muted-foreground" />
                  {c.phone ? <a href={`tel:${c.phone}`} dir="ltr" className="hover:underline">{c.phone}</a> : "—"}
                </p>
                <p className="flex items-center gap-2 text-zinc-700">
                  <Building2 className="size-4 text-muted-foreground" />
                  {c.company ?? "—"}
                </p>
                <p className="text-xs text-muted-foreground">לקוח מאז {formatDate(c.created_at)}</p>
              </div>
              {customFields.length > 0 && (
                <div className="space-y-2 rounded-xl border bg-surface p-5 text-sm shadow-sm">
                  <h3 className="font-semibold">פרטים נוספים</h3>
                  {customFields.map(([k, v]) => (
                    <div key={k} className="flex justify-between gap-3">
                      <span className="capitalize text-muted-foreground">{k.replace(/_/g, " ")}</span>
                      <span dir="auto" className="truncate text-end">{String(v)}</span>
                    </div>
                  ))}
                </div>
              )}
              <div className="rounded-xl border bg-surface p-5 shadow-sm">
                <h3 className="mb-1 text-sm font-semibold">משימות פתוחות</h3>
                {openTasks.length ? <TaskList tasks={openTasks.slice(0, 5)} showCustomer={false} /> : <p className="text-sm text-muted-foreground">אין משימות פתוחות.</p>}
              </div>
            </aside>
          </div>
        </TabsContent>

        <TabsContent value="transactions">
          {transactions.length ? (
            <div className="overflow-hidden rounded-xl border bg-surface shadow-sm">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="ps-4">תאריך</TableHead>
                    <TableHead>מוצר / שירות</TableHead>
                    <TableHead className="hidden sm:table-cell">טופל על ידי</TableHead>
                    <TableHead className="hidden sm:table-cell">סטטוס</TableHead>
                    <TableHead className="pe-4 text-end">סכום</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {transactions.map((t) => (
                    <TableRow key={t.id}>
                      <TableCell className="ps-4 text-muted-foreground tabular">{formatDate(t.date)}</TableCell>
                      <TableCell>{t.product_or_service ?? "—"}</TableCell>
                      <TableCell className="hidden text-muted-foreground sm:table-cell">{t.owner_name ?? "—"}</TableCell>
                      <TableCell className="hidden sm:table-cell">
                        <Badge variant={t.status === "paid" ? "default" : t.status === "pending" ? "warning" : "negative"} >
                          {t.type === "refund" ? TRANSACTION_TYPE_LABELS.refund : label(TRANSACTION_STATUS_LABELS, t.status)}
                        </Badge>
                      </TableCell>
                      <TableCell className="pe-4 text-end font-medium tabular">
                        <Ltr>{money(t.type === "refund" ? -t.amount : t.amount)}</Ltr>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <EmptyState compact icon={Receipt} title="עדיין אין מכירות" description="כאן יופיעו הקניות של הלקוח הזה." />
          )}
        </TabsContent>

        <TabsContent value="activities">
          {activities.length ? (
            <div className="rounded-xl border bg-surface px-4 shadow-sm">
              {activities.map((a) => (
                <ActivityItem key={a.id} activity={a} showCustomer={false} />
              ))}
            </div>
          ) : (
            <EmptyState compact icon={CalendarClock} title="עדיין אין פעילות" description="רשום תורים, שיחות וביקורים בעזרת הכפתורים למעלה." />
          )}
        </TabsContent>

        <TabsContent value="deals">
          {deals.length ? (
            <div className="divide-y overflow-hidden rounded-xl border bg-surface shadow-sm">
              {deals.map((d) => (
                <Link key={d.id} href={`/deals?deal=${d.id}`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-muted/40">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{d.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {STAGE_LABELS[d.stage]} · צפי לסגירה {formatDate(d.expected_close)}
                    </p>
                  </div>
                  <Ltr className="text-sm font-medium tabular">{money(d.value)}</Ltr>
                </Link>
              ))}
            </div>
          ) : (
            <EmptyState compact icon={Handshake} title="אין עסקאות" description="כאן יופיעו עסקאות שקשורות ללקוח הזה." />
          )}
        </TabsContent>

        <TabsContent value="tasks">
          {tasks.length ? (
            <div className="rounded-xl border bg-surface px-4 shadow-sm">
              <TaskList tasks={tasks} showCustomer={false} />
            </div>
          ) : (
            <EmptyState compact icon={ListChecks} title="אין משימות" description="צור משימה כדי לא לשכוח לחזור ללקוח הזה." />
          )}
        </TabsContent>
      </ProfileTabs>
    </PageContainer>
  );
}
