import Link from "next/link";
import { Users, X } from "@phosphor-icons/react/dist/ssr";
import { requireOrg } from "@/lib/supabase/server";
import { getCustomerRevenue, getCustomersAtRisk, getOverdueCustomers } from "@/lib/analytics/queries";
import { PageContainer, PageHeader } from "@/components/layout/page";
import { CustomersTable, type CustomerRow } from "@/components/business/customers-table";
import { FilterTabs, Pagination, SearchInput } from "@/components/business/list-controls";
import { EmptyState } from "@/components/business/empty-state";
import { NewRecordButton } from "@/components/business/record-form";
import { Button } from "@/components/ui/button";
import { LiveDot, Module, ModuleFlush, ModuleRail } from "@/components/ui/module";
import { pageParam, param, searchTerm, uuidList, type SearchParams } from "@/lib/params";
import { formatNumber, plural } from "@/lib/utils";
import { resolveTerms } from "@/lib/terms";

export async function generateMetadata() {
  const { org } = await requireOrg();
  return { title: resolveTerms(org.terms).customers };
}
const PAGE_SIZE = 50;

export default async function CustomersPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const { supabase, org } = await requireOrg();
  const t = resolveTerms(org.terms);
  const page = pageParam(params);
  const q = searchTerm(param(params, "q"));
  const status = param(params, "status");
  const segment = param(params, "segment");
  let ids = uuidList(param(params, "ids"));
  let title = param(params, "title")?.slice(0, 120) ?? null;
  const notes = new Map<string, string>();

  if (segment === "at-risk") {
    const threshold = Number(param(params, "threshold") ?? 60);
    const drop = Number(param(params, "drop") ?? 30);
    const risk = await getCustomersAtRisk(supabase, org.id, threshold, drop, 500);
    ids = risk.map((r) => r.id);
    for (const r of risk)
      notes.set(r.id, `${r.change_pct !== null && r.change_pct < 0 ? `ההכנסות ירדו ב־${Math.abs(r.change_pct)}% · ` : ""}פעילות אחרונה לפני ${formatNumber(r.days_since)} ימים`);
    title ??= `${t.customers} בסיכון`;
  } else if (segment === "overdue") {
    const overdue = await getOverdueCustomers(supabase, org.id, 1.5, 500);
    ids = overdue.map((r) => r.id);
    for (const r of overdue) notes.set(r.id, `בדרך כלל חוזר כל ${formatNumber(r.median_interval_days)} ימים · נראה לאחרונה לפני ${formatNumber(r.days_since)} ימים`);
    title ??= `${t.customers} קבועים שעבר הזמן שבו הם בדרך כלל חוזרים`;
  }
  const segmented = Boolean(segment) || ids.length > 0 || param(params, "ids") !== undefined;

  type Base = { id: string; name: string; email: string | null; phone: string | null; company: string | null; status: string; custom_fields: Record<string, unknown> | null };
  let base: Base[] = [];
  let count = 0;
  let error: unknown = null;

  if (segmented) {
    // Segment ids can be long; fetch in chunks to keep request URLs small, then filter & page in memory.
    const chunks: string[][] = [];
    for (let i = 0; i < ids.length; i += 100) chunks.push(ids.slice(i, i + 100));
    const results = await Promise.all(
      chunks.map((chunk) =>
        supabase.from("customers").select("id, name, email, phone, company, status, custom_fields").eq("organization_id", org.id).in("id", chunk),
      ),
    );
    error = results.find((r) => r.error)?.error ?? null;
    const order = new Map(ids.map((id, i) => [id, i]));
    const lower = q.toLowerCase();
    const all = results
      .flatMap((r) => (r.data ?? []) as Base[])
      .filter((c) => !status || c.status === status)
      .filter((c) => !q || [c.name, c.email, c.company, c.phone].some((v) => v?.toLowerCase().includes(lower)))
      .sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
    count = all.length;
    base = all.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  } else {
    let query = supabase
      .from("customers")
      .select("id, name, email, phone, company, status, custom_fields", { count: "exact" })
      .eq("organization_id", org.id);
    if (q) query = query.or(`name.ilike.%${q}%,email.ilike.%${q}%,company.ilike.%${q}%,phone.ilike.%${q}%`);
    if (status) query = query.eq("status", status);
    const res = await query.order("created_at", { ascending: false }).range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
    base = (res.data ?? []) as Base[];
    count = res.count ?? 0;
    error = res.error;
  }

  const revenue = await getCustomerRevenue(supabase, org.id, base.map((c) => c.id)).catch(() => new Map());
  const rows: CustomerRow[] = base.map((c) => ({
    ...c,
    revenue: revenue.get(c.id)?.revenue ?? 0,
    purchases: revenue.get(c.id)?.purchases ?? 0,
    last_purchase: revenue.get(c.id)?.last_purchase ?? null,
    note: notes.get(c.id) ?? null,
  }));

  const { count: totalCustomers } = await supabase
    .from("customers")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", org.id);

  return (
    <PageContainer>
      <PageHeader
        title={t.customers}
        description="כל מי שאתה עובד איתו — במקום אחד."
        actions={<NewRecordButton entity="customers" />}
      />
      {!totalCustomers ? (
        <Module>
          <ModuleRail icon={<Users />} title={`ה${t.customers} שלי`} />
          <EmptyState
            icon={Users}
            title={`אין עדיין ${t.customers}`}
            description={`העלה קובץ אקסל עם רשימת ה${t.customers} שלך, או הוסף אחד ידנית — הם יופיעו כאן.`}
            importCta
            action={<NewRecordButton entity="customers" variant="outline" />}
          />
        </Module>
      ) : (
        <Module>
          <ModuleRail
            icon={<Users />}
            title={segmented ? (title ?? `${t.customers} שנבחרו`) : `ה${t.customers} שלי`}
            meta={<span className="num">{formatNumber(count)}</span>}
            actions={
              segmented ? (
                <Button asChild size="xs" variant="ghost">
                  <Link href="/customers">
                    <X />
                    נקה
                  </Link>
                </Button>
              ) : (
                <LiveDot state={q || status ? "filtered" : "live"} label={q || status ? "מסונן" : undefined} />
              )
            }
          />
          {segmented && (
            <p className="border-b border-border bg-brand-soft/50 px-3.5 py-2 text-xs text-muted-foreground">
              {plural(count, t.customer, t.customers, `1 ${t.customer}`)} בתצוגה הזו. סמן כדי ליצור משימות מעקב.
            </p>
          )}
          <div className="flex flex-col gap-2 border-b border-border px-3.5 py-2.5 sm:flex-row sm:items-center sm:justify-between">
            <SearchInput placeholder="חיפוש לפי שם, אימייל, טלפון או חברה…" />
            <FilterTabs
              param="status"
              options={[
                { value: "", label: "הכל" },
                { value: "active", label: "פעילים" },
                { value: "inactive", label: "לא פעילים" },
                { value: "churned", label: "עזבו" },
              ]}
            />
          </div>
          {error ? (
            <EmptyState title={`לא הצלחנו לטעון את ה${t.customers}`} description="רענן את העמוד ונסה שוב." />
          ) : rows.length === 0 ? (
            <EmptyState compact icon={Users} title={`לא נמצאו ${t.customers}`} description="נסה חיפוש אחר או סינון אחר." />
          ) : (
            <ModuleFlush>
              <CustomersTable rows={rows} allIds={segmented ? ids : undefined} defaultTaskTitle={`לחזור ל${t.customer}`} />
            </ModuleFlush>
          )}
          <Pagination page={page} pageSize={PAGE_SIZE} total={count} />
        </Module>
      )}
    </PageContainer>
  );
}
