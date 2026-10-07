import { notFound } from "next/navigation";
import Link from "next/link";
import { AddressBook, Buildings, CalendarDots, CaretLeft, ChartBar, Envelope, Handshake, ListChecks, Phone, Receipt, Tag } from "@phosphor-icons/react/dist/ssr";
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
import { StageName } from "@/components/business/stage-name";
import { formatCurrency, formatDate, formatNumber, plural, relativeDays } from "@/lib/utils";
import { Ltr } from "@/components/ui/ltr";
import { Module, ModuleBody, ModuleRail } from "@/components/ui/module";
import { CUSTOMER_STATUS_LABELS, TRANSACTION_STATUS_LABELS, TRANSACTION_TYPE_LABELS, label } from "@/components/business/labels";
import type { Activity, Customer, Deal, Task, Transaction } from "@/types/domain";
import { resolveTerms } from "@/lib/terms";
import { loadFields } from "@/lib/stages";
import { formatFieldValue } from "@/lib/fields";

export default async function CustomerProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) notFound();
  const { supabase, org } = await requireOrg();
  const terms = resolveTerms(org.terms);
  const serviceHead = terms.service === "שירות" ? "מוצר / שירות" : terms.service;

  const { data: customer } = await supabase.from("customers").select("*").eq("id", id).eq("organization_id", org.id).maybeSingle();
  if (!customer) notFound();
  const c = customer as Customer;

  const [txRes, actRes, dealRes, taskRes, allTx, fieldDefs] = await Promise.all([
    supabase.from("transactions").select("*").eq("customer_id", id).order("date", { ascending: false }).limit(100),
    supabase.from("activities").select("*").eq("customer_id", id).order("date", { ascending: false }).limit(50),
    supabase.from("deals").select("*").eq("customer_id", id).order("updated_at", { ascending: false }),
    supabase.from("tasks").select("*, deals(name)").eq("customer_id", id).order("status").order("due_date"),
    supabase.from("transactions").select("amount, date, type, status, product_or_service").eq("customer_id", id).order("date"),
    loadFields(supabase, org.id),
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
  // The business's own fields first (in its order, empty ones hidden), then other stored keys
  // such as raw columns kept from an import. Keys of removed fields (f_…) stay hidden.
  const ownFields = fieldDefs
    .filter((f) => f.entity === "customers")
    .map((f) => ({ key: f.key, label: f.label, type: f.type, text: formatFieldValue(f, c.custom_fields?.[f.key], org.currency) }))
    .filter((f) => f.text);
  const customFields = Object.entries(c.custom_fields ?? {}).filter(
    ([k, v]) => !/^f_[a-z0-9_]+$/.test(k) && (typeof v === "string" || typeof v === "number"),
  );
  const money = (n: number) => formatCurrency(n, org.currency);

  return (
    <PageContainer>
      <Link href="/customers" className="mb-5 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
        <CaretLeft className="size-3.5 rtl:-scale-x-100" />
        {terms.customers}
      </Link>

      <div className="mb-8 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0 space-y-2">
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{c.name}</h1>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Badge variant={c.status === "active" ? "positive" : c.status === "churned" ? "negative" : "default"}>
              {label(CUSTOMER_STATUS_LABELS, c.status)}
            </Badge>
            {segment && <Badge variant="outline">{segment}</Badge>}
            <span className="text-muted-foreground">·</span>
            <span className="text-[13px] text-muted-foreground">
              <Ltr className="num font-medium text-foreground">{money(totalRevenue)}</Ltr> סה״כ הכנסות
            </span>
          </div>
        </div>
        <CustomerActions customer={c} />
      </div>

      <ProfileTabs
        tabs={[
          { value: "overview", label: "סקירה" },
          { value: "transactions", label: terms.sales, count: history.length },
          { value: "activities", label: "פעילות", count: activities.length },
          { value: "deals", label: terms.deals, count: deals.length },
          { value: "tasks", label: "משימות", count: openTasks.length },
        ]}
      >
        <TabsContent value="overview">
          <div className="grid items-start gap-6 lg:grid-cols-3">
            <div className="space-y-6 lg:col-span-2">
              <Module>
                <div className="grid grid-cols-2 gap-px bg-border sm:grid-cols-4 [&>*]:bg-module [&>*]:p-4">
                  <Stat label="קניות" value={formatNumber(purchases.length)} />
                  <Stat label="קנייה ממוצעת" value={<Ltr>{money(purchases.length ? totalRevenue / purchases.length : 0)}</Ltr>} />
                  <Stat label="קנייה אחרונה" value={lastPurchase ? relativeDays(lastPurchase) : "—"} hint={lastPurchase ? formatDate(lastPurchase) : undefined} />
                  <Stat label="חוזר בדרך כלל כל" value={usualInterval ? plural(usualInterval, "יום", "ימים") : "—"} />
                </div>
              </Module>
              {topServices.length > 0 && (
                <Module>
                  <ModuleRail icon={<ChartBar />} title="מה הוא קונה" />
                  <ul className="divide-y divide-border/60">
                    {topServices.map(([name, amount]) => (
                      <li key={name} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm sm:px-5">
                        <span className="truncate">{name}</span>
                        <Ltr className="num text-muted-foreground">{money(amount)}</Ltr>
                      </li>
                    ))}
                  </ul>
                </Module>
              )}
              <Module>
                <ModuleRail icon={<CalendarDots />} title="פעילות אחרונה" />
                <div className="px-4 sm:px-5">
                  {activities.length ? (
                    activities.slice(0, 4).map((a) => <ActivityItem key={a.id} activity={a} showCustomer={false} />)
                  ) : (
                    <p className="py-4 text-sm text-muted-foreground">עוד לא נרשמה פעילות.</p>
                  )}
                </div>
              </Module>
            </div>
            <aside className="space-y-6">
              <Module>
                <ModuleRail icon={<AddressBook />} title="פרטי קשר" />
                <ModuleBody className="space-y-3 text-sm">
                  <p className="flex items-center gap-2 text-foreground/80">
                    <Envelope className="size-4 shrink-0 text-muted-foreground" />
                    {c.email ? (
                      <a href={`mailto:${c.email}`} dir="ltr" className="truncate hover:underline">
                        {c.email}
                      </a>
                    ) : (
                      "—"
                    )}
                  </p>
                  <p className="flex items-center gap-2 text-foreground/80">
                    <Phone className="size-4 shrink-0 text-muted-foreground" />
                    {c.phone ? (
                      <a href={`tel:${c.phone}`} dir="ltr" className="num hover:underline">
                        {c.phone}
                      </a>
                    ) : (
                      "—"
                    )}
                  </p>
                  <p className="flex items-center gap-2 text-foreground/80">
                    <Buildings className="size-4 shrink-0 text-muted-foreground" />
                    {c.company ?? "—"}
                  </p>
                  <p className="border-t border-border pt-3 text-xs text-muted-foreground">{terms.customer} מאז {formatDate(c.created_at)}</p>
                </ModuleBody>
              </Module>
              {ownFields.length + customFields.length > 0 && (
                <Module>
                  <ModuleRail icon={<Tag />} title="פרטים נוספים" />
                  <ModuleBody className="space-y-2 text-sm">
                    {ownFields.map((f) => (
                      <div key={f.key} className="flex justify-between gap-3">
                        <span dir="auto" className="shrink-0 text-muted-foreground">
                          {f.label}
                        </span>
                        <span
                          dir={f.type === "number" || f.type === "money" || f.type === "phone" ? "ltr" : "auto"}
                          className={f.type === "number" || f.type === "money" || f.type === "phone" ? "num truncate" : "truncate text-end"}
                          title={f.text}
                        >
                          {f.type === "phone" ? <a href={`tel:${f.text}`} className="hover:underline">{f.text}</a> : f.text}
                        </span>
                      </div>
                    ))}
                    {customFields.map(([k, v]) => (
                      <div key={k} className="flex justify-between gap-3">
                        <span className="capitalize text-muted-foreground">{k.replace(/_/g, " ")}</span>
                        <span dir="auto" className="truncate text-end">
                          {String(v)}
                        </span>
                      </div>
                    ))}
                  </ModuleBody>
                </Module>
              )}
              <Module>
                <ModuleRail icon={<ListChecks />} title="משימות פתוחות" meta={openTasks.length ? <span className="num">{formatNumber(openTasks.length)}</span> : undefined} />
                <div className="px-4 sm:px-5">
                  {openTasks.length ? (
                    <TaskList tasks={openTasks.slice(0, 5)} showCustomer={false} />
                  ) : (
                    <p className="py-4 text-sm text-muted-foreground">אין משימות פתוחות.</p>
                  )}
                </div>
              </Module>
            </aside>
          </div>
        </TabsContent>

        <TabsContent value="transactions">
          <Module>
            <ModuleRail icon={<Receipt />} title={terms.sales} meta={<span className="num">{formatNumber(transactions.length)}</span>} />
            {transactions.length ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="ps-4">תאריך</TableHead>
                    <TableHead>{serviceHead}</TableHead>
                    <TableHead className="hidden sm:table-cell">טופל על ידי</TableHead>
                    <TableHead className="hidden sm:table-cell">סטטוס</TableHead>
                    <TableHead className="pe-4 text-end">סכום</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {transactions.map((t) => (
                    <TableRow key={t.id}>
                      <TableCell className="ps-4 text-[13px] text-muted-foreground tabular">{formatDate(t.date)}</TableCell>
                      <TableCell>{t.product_or_service ?? "—"}</TableCell>
                      <TableCell className="hidden text-muted-foreground sm:table-cell">{t.owner_name ?? "—"}</TableCell>
                      <TableCell className="hidden sm:table-cell">
                        <Badge variant={t.status === "paid" ? "default" : t.status === "pending" ? "warning" : "negative"}>
                          {t.type === "refund" ? TRANSACTION_TYPE_LABELS.refund : label(TRANSACTION_STATUS_LABELS, t.status)}
                        </Badge>
                      </TableCell>
                      <TableCell className="num pe-4 text-end font-medium">
                        <Ltr>{money(t.type === "refund" ? -t.amount : t.amount)}</Ltr>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <EmptyState compact icon={Receipt} title={`עדיין אין ${terms.sales}`} description="כאן יופיעו הקניות שנרשמו בכרטיס הזה." />
            )}
          </Module>
        </TabsContent>

        <TabsContent value="activities">
          <Module>
            <ModuleRail icon={<CalendarDots />} title="פעילות" meta={<span className="num">{formatNumber(activities.length)}</span>} />
            {activities.length ? (
              <div className="px-4 sm:px-5">
                {activities.map((a) => (
                  <ActivityItem key={a.id} activity={a} showCustomer={false} />
                ))}
              </div>
            ) : (
              <EmptyState compact icon={CalendarDots} title="עדיין אין פעילות" description={`רשום ${terms.appointments}, שיחות והערות בעזרת הכפתורים למעלה.`} />
            )}
          </Module>
        </TabsContent>

        <TabsContent value="deals">
          <Module>
            <ModuleRail icon={<Handshake />} title={terms.deals} meta={<span className="num">{formatNumber(deals.length)}</span>} />
            {deals.length ? (
              <div className="divide-y divide-border/60">
                {deals.map((d) => (
                  <Link key={d.id} href={`/deals?deal=${d.id}`} className="flex items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-muted/50 sm:px-5">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{d.name}</p>
                      <p className="text-xs text-muted-foreground">
                        <StageName stage={d.stage} /> · צפי לסגירה {formatDate(d.expected_close)}
                      </p>
                    </div>
                    <Ltr className="num text-sm font-medium">{money(d.value)}</Ltr>
                  </Link>
                ))}
              </div>
            ) : (
              <EmptyState compact icon={Handshake} title={`אין ${terms.deals}`} description={`${terms.deals} שנפתחו בכרטיס הזה יופיעו כאן.`} />
            )}
          </Module>
        </TabsContent>

        <TabsContent value="tasks">
          <Module>
            <ModuleRail icon={<ListChecks />} title="משימות" meta={<span className="num">{formatNumber(tasks.length)}</span>} />
            {tasks.length ? (
              <div className="px-4 sm:px-5">
                <TaskList tasks={tasks} showCustomer={false} />
              </div>
            ) : (
              <EmptyState compact icon={ListChecks} title="אין משימות" description="צור משימה כדי לא לשכוח לחזור אליו." />
            )}
          </Module>
        </TabsContent>
      </ProfileTabs>
    </PageContainer>
  );
}
