import Link from "next/link";
import { Users, X } from "lucide-react";
import { requireOrg } from "@/lib/supabase/server";
import { getCustomerRevenue, getCustomersAtRisk, getOverdueCustomers } from "@/lib/analytics/queries";
import { PageContainer, PageHeader } from "@/components/layout/page";
import { CustomersTable, type CustomerRow } from "@/components/business/customers-table";
import { FilterTabs, Pagination, SearchInput } from "@/components/business/list-controls";
import { EmptyState } from "@/components/business/empty-state";
import { NewRecordButton } from "@/components/business/record-form";
import { Button } from "@/components/ui/button";
import { pageParam, param, searchTerm, uuidList, type SearchParams } from "@/lib/params";

export const metadata = { title: "Customers" };
const PAGE_SIZE = 50;

export default async function CustomersPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const { supabase, org } = await requireOrg();
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
      notes.set(r.id, `${r.change_pct !== null && r.change_pct < 0 ? `Revenue ↓ ${Math.abs(r.change_pct)}% · ` : ""}last activity ${r.days_since} days ago`);
    title ??= "Customers at risk";
  } else if (segment === "overdue") {
    const overdue = await getOverdueCustomers(supabase, org.id, 1.5, 500);
    ids = overdue.map((r) => r.id);
    for (const r of overdue) notes.set(r.id, `Usually every ${r.median_interval_days} days · last seen ${r.days_since} days ago`);
    title ??= "Regulars past their usual return date";
  }
  const segmented = Boolean(segment) || ids.length > 0 || param(params, "ids") !== undefined;

  type Base = { id: string; name: string; email: string | null; phone: string | null; company: string | null; status: string };
  let base: Base[] = [];
  let count = 0;
  let error: unknown = null;

  if (segmented) {
    // Segment ids can be long; fetch in chunks to keep request URLs small, then filter & page in memory.
    const chunks: string[][] = [];
    for (let i = 0; i < ids.length; i += 100) chunks.push(ids.slice(i, i + 100));
    const results = await Promise.all(
      chunks.map((chunk) =>
        supabase.from("customers").select("id, name, email, phone, company, status").eq("organization_id", org.id).in("id", chunk),
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
      .select("id, name, email, phone, company, status", { count: "exact" })
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
        title="Customers"
        description="Everyone you do business with, in one place."
        actions={<NewRecordButton entity="customers" />}
      />
      {!totalCustomers ? (
        <EmptyState
          icon={Users}
          title="No customers yet"
          description="Import your existing customer list, or add your first customer."
          importCta
          action={<NewRecordButton entity="customers" variant="outline" />}
        />
      ) : (
        <>
          {segmented && (
            <div className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border bg-brand-soft/60 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{title ?? "Selected customers"}</p>
                <p className="text-xs text-muted-foreground">
                  {count.toLocaleString("en-US")} customers in this view. Select customers to create follow-up tasks.
                </p>
              </div>
              <Button asChild size="xs" variant="ghost">
                <Link href="/customers">
                  <X />
                  Clear
                </Link>
              </Button>
            </div>
          )}
          <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <SearchInput placeholder="Search name, email, phone, company…" />
            <FilterTabs
              param="status"
              options={[
                { value: "", label: "All" },
                { value: "active", label: "Active" },
                { value: "inactive", label: "Inactive" },
                { value: "churned", label: "Churned" },
              ]}
            />
          </div>
          {error ? (
            <EmptyState title="We couldn't load customers" description="Please refresh the page." />
          ) : rows.length === 0 ? (
            <EmptyState compact title="No matching customers" description="Try a different search or filter." />
          ) : (
            <CustomersTable rows={rows} allIds={segmented ? ids : undefined} defaultTaskTitle="Follow up" />
          )}
          <Pagination page={page} pageSize={PAGE_SIZE} total={count} />
        </>
      )}
    </PageContainer>
  );
}
