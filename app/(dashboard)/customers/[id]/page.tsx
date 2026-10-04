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
import { formatCurrency, formatDate, relativeDays } from "@/lib/utils";
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
  for (const t of purchases) byService.set(t.product_or_service ?? "Other", (byService.get(t.product_or_service ?? "Other") ?? 0) + Number(t.amount));
  const topServices = [...byService.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
  const openTasks = tasks.filter((t) => t.status === "open");
  const segment = typeof c.custom_fields?.segment === "string" ? (c.custom_fields.segment as string) : null;
  const customFields = Object.entries(c.custom_fields ?? {}).filter(([, v]) => typeof v === "string" || typeof v === "number");
  const money = (n: number) => formatCurrency(n, org.currency);

  return (
    <PageContainer>
      <Link href="/customers" className="mb-5 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
        <ChevronLeft className="size-3.5" />
        Customers
      </Link>

      <div className="mb-8 flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-2">
          <h1 className="text-[26px] font-semibold tracking-tight">{c.name}</h1>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Badge variant={c.status === "active" ? "positive" : c.status === "churned" ? "negative" : "default"} className="capitalize">
              {c.status} customer
            </Badge>
            {segment && <Badge variant="outline">{segment}</Badge>}
          </div>
          <p className="text-lg font-medium tabular">
            {money(totalRevenue)} <span className="text-sm font-normal text-muted-foreground">total revenue</span>
          </p>
        </div>
        <CustomerActions customer={c} />
      </div>

      <ProfileTabs
        tabs={[
          { value: "overview", label: "Overview" },
          { value: "transactions", label: "Transactions", count: history.length },
          { value: "activities", label: "Activities", count: activities.length },
          { value: "deals", label: "Deals", count: deals.length },
          { value: "tasks", label: "Tasks", count: openTasks.length },
        ]}
      >
        <TabsContent value="overview">
          <div className="grid gap-8 lg:grid-cols-3">
            <div className="space-y-8 lg:col-span-2">
              <div className="grid grid-cols-2 gap-5 rounded-lg border bg-surface p-5 sm:grid-cols-4">
                <Stat label="Purchases" value={purchases.length} />
                <Stat label="Average purchase" value={money(purchases.length ? totalRevenue / purchases.length : 0)} />
                <Stat label="Last purchase" value={lastPurchase ? relativeDays(lastPurchase) : "—"} hint={lastPurchase ? formatDate(lastPurchase) : undefined} />
                <Stat label="Usually returns every" value={usualInterval ? `${usualInterval} days` : "—"} />
              </div>
              {topServices.length > 0 && (
                <div>
                  <h3 className="mb-3 text-sm font-semibold">What they buy</h3>
                  <ul className="space-y-2">
                    {topServices.map(([name, amount]) => (
                      <li key={name} className="flex items-center justify-between text-sm">
                        <span>{name}</span>
                        <span className="tabular text-muted-foreground">{money(amount)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <div>
                <h3 className="mb-2 text-sm font-semibold">Recent activity</h3>
                {activities.length ? (
                  activities.slice(0, 4).map((a) => <ActivityItem key={a.id} activity={a} showCustomer={false} />)
                ) : (
                  <p className="text-sm text-muted-foreground">No activities logged yet.</p>
                )}
              </div>
            </div>
            <aside className="space-y-6">
              <div className="space-y-3 rounded-lg border bg-surface p-5 text-sm">
                <h3 className="font-semibold">Contact</h3>
                <p className="flex items-center gap-2 text-zinc-700">
                  <Mail className="size-4 text-muted-foreground" />
                  {c.email ? (
                    <a href={`mailto:${c.email}`} className="truncate hover:underline">
                      {c.email}
                    </a>
                  ) : (
                    "—"
                  )}
                </p>
                <p className="flex items-center gap-2 text-zinc-700">
                  <Phone className="size-4 text-muted-foreground" />
                  {c.phone ? <a href={`tel:${c.phone}`}>{c.phone}</a> : "—"}
                </p>
                <p className="flex items-center gap-2 text-zinc-700">
                  <Building2 className="size-4 text-muted-foreground" />
                  {c.company ?? "—"}
                </p>
                <p className="text-xs text-muted-foreground">Customer since {formatDate(c.created_at)}</p>
              </div>
              {customFields.length > 0 && (
                <div className="space-y-2 rounded-lg border bg-surface p-5 text-sm">
                  <h3 className="font-semibold">Details</h3>
                  {customFields.map(([k, v]) => (
                    <div key={k} className="flex justify-between gap-3">
                      <span className="capitalize text-muted-foreground">{k.replace(/_/g, " ")}</span>
                      <span className="truncate text-right">{String(v)}</span>
                    </div>
                  ))}
                </div>
              )}
              <div className="rounded-lg border bg-surface p-5">
                <h3 className="mb-1 text-sm font-semibold">Open tasks</h3>
                {openTasks.length ? <TaskList tasks={openTasks.slice(0, 5)} showCustomer={false} /> : <p className="text-sm text-muted-foreground">Nothing open.</p>}
              </div>
            </aside>
          </div>
        </TabsContent>

        <TabsContent value="transactions">
          {transactions.length ? (
            <div className="rounded-lg border bg-surface">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="pl-4">Date</TableHead>
                    <TableHead>Product / service</TableHead>
                    <TableHead className="hidden sm:table-cell">Handled by</TableHead>
                    <TableHead className="hidden sm:table-cell">Status</TableHead>
                    <TableHead className="pr-4 text-right">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {transactions.map((t) => (
                    <TableRow key={t.id}>
                      <TableCell className="pl-4 text-muted-foreground tabular">{formatDate(t.date)}</TableCell>
                      <TableCell>{t.product_or_service ?? "—"}</TableCell>
                      <TableCell className="hidden text-muted-foreground sm:table-cell">{t.owner_name ?? "—"}</TableCell>
                      <TableCell className="hidden sm:table-cell">
                        <Badge variant={t.status === "paid" ? "default" : t.status === "pending" ? "warning" : "negative"} className="capitalize">
                          {t.type === "refund" ? "refund" : t.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="pr-4 text-right font-medium tabular">{money(t.type === "refund" ? -t.amount : t.amount)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <EmptyState compact icon={Receipt} title="No transactions yet" description="Purchases for this customer will appear here." />
          )}
        </TabsContent>

        <TabsContent value="activities">
          {activities.length ? (
            <div className="rounded-lg border bg-surface px-4">
              {activities.map((a) => (
                <ActivityItem key={a.id} activity={a} showCustomer={false} />
              ))}
            </div>
          ) : (
            <EmptyState compact icon={CalendarClock} title="No activities yet" description="Log appointments, calls and visits from the actions above." />
          )}
        </TabsContent>

        <TabsContent value="deals">
          {deals.length ? (
            <div className="divide-y rounded-lg border bg-surface">
              {deals.map((d) => (
                <Link key={d.id} href={`/deals?deal=${d.id}`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-muted/40">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{d.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {STAGE_LABELS[d.stage]} · expected close {formatDate(d.expected_close)}
                    </p>
                  </div>
                  <span className="text-sm font-medium tabular">{money(d.value)}</span>
                </Link>
              ))}
            </div>
          ) : (
            <EmptyState compact icon={Handshake} title="No deals" description="Deals linked to this customer will appear here." />
          )}
        </TabsContent>

        <TabsContent value="tasks">
          {tasks.length ? (
            <div className="rounded-lg border bg-surface px-4">
              <TaskList tasks={tasks} showCustomer={false} />
            </div>
          ) : (
            <EmptyState compact icon={ListChecks} title="No tasks" description="Create a task to follow up with this customer." />
          )}
        </TabsContent>
      </ProfileTabs>
    </PageContainer>
  );
}
