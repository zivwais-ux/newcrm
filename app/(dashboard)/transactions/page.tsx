import Link from "next/link";
import { Receipt } from "lucide-react";
import { requireOrg } from "@/lib/supabase/server";
import { PageContainer, PageHeader } from "@/components/layout/page";
import { FilterTabs, Pagination, SearchInput } from "@/components/business/list-controls";
import { EmptyState } from "@/components/business/empty-state";
import { NewRecordButton } from "@/components/business/record-form";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatCurrency, formatDate } from "@/lib/utils";
import { pageParam, param, searchTerm, type SearchParams } from "@/lib/params";
import type { Transaction } from "@/types/domain";

export const metadata = { title: "Transactions" };
const PAGE_SIZE = 50;

export default async function TransactionsPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const { supabase, org } = await requireOrg();
  const page = pageParam(params);
  const q = searchTerm(param(params, "q"));
  const type = param(params, "type");

  let query = supabase.from("transactions").select("*, customers(name)", { count: "exact" }).eq("organization_id", org.id);
  if (q) query = query.or(`product_or_service.ilike.%${q}%,owner_name.ilike.%${q}%`);
  if (type) query = query.eq("type", type);
  const { data, count } = await query
    .order("date", { ascending: false })
    .order("created_at", { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  const rows = (data ?? []) as Transaction[];
  const { count: total } = await supabase.from("transactions").select("id", { count: "exact", head: true }).eq("organization_id", org.id);

  return (
    <PageContainer>
      <PageHeader title="Transactions" description="Sales, payments and refunds." actions={<NewRecordButton entity="transactions" />} />
      {!total ? (
        <EmptyState
          icon={Receipt}
          title="No transaction data yet"
          description="Import your existing sales data to unlock revenue insights."
          importCta
          action={<NewRecordButton entity="transactions" variant="outline" />}
        />
      ) : (
        <>
          <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <SearchInput placeholder="Search product, service or staff…" />
            <FilterTabs
              param="type"
              options={[
                { value: "", label: "All" },
                { value: "sale", label: "Sales" },
                { value: "subscription", label: "Subscriptions" },
                { value: "refund", label: "Refunds" },
              ]}
            />
          </div>
          {rows.length ? (
            <div className="rounded-lg border bg-surface">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="pl-4">Date</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead className="hidden md:table-cell">Product / service</TableHead>
                    <TableHead className="hidden lg:table-cell">Handled by</TableHead>
                    <TableHead className="hidden sm:table-cell">Status</TableHead>
                    <TableHead className="pr-4 text-right">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((t) => (
                    <TableRow key={t.id}>
                      <TableCell className="pl-4 text-muted-foreground tabular">{formatDate(t.date)}</TableCell>
                      <TableCell className="max-w-[220px]">
                        {t.customer_id ? (
                          <Link href={`/customers/${t.customer_id}`} className="block truncate hover:underline">
                            {t.customers?.name ?? "Customer"}
                          </Link>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="hidden md:table-cell">{t.product_or_service ?? "—"}</TableCell>
                      <TableCell className="hidden text-muted-foreground lg:table-cell">{t.owner_name ?? "—"}</TableCell>
                      <TableCell className="hidden sm:table-cell">
                        <Badge variant={t.type === "refund" ? "negative" : t.status === "pending" ? "warning" : "default"} className="capitalize">
                          {t.type === "refund" ? "refund" : t.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="pr-4 text-right font-medium tabular">
                        {formatCurrency(t.type === "refund" ? -t.amount : t.amount, org.currency)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <EmptyState compact title="No matching transactions" />
          )}
          <Pagination page={page} pageSize={PAGE_SIZE} total={count ?? 0} />
        </>
      )}
    </PageContainer>
  );
}
