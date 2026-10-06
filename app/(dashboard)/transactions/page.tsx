import Link from "next/link";
import { Receipt, X } from "lucide-react";
import { requireOrg } from "@/lib/supabase/server";
import { PageContainer, PageHeader } from "@/components/layout/page";
import { FilterTabs, Pagination, SearchInput } from "@/components/business/list-controls";
import { EmptyState } from "@/components/business/empty-state";
import { NewRecordButton } from "@/components/business/record-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatCurrency, formatDate } from "@/lib/utils";
import { Ltr } from "@/components/ui/ltr";
import { TRANSACTION_STATUS_LABELS, TRANSACTION_TYPE_LABELS, label } from "@/components/business/labels";
import { pageParam, param, searchTerm, type SearchParams } from "@/lib/params";
import type { Transaction } from "@/types/domain";

export const metadata = { title: "כסף ומכירות" };
const PAGE_SIZE = 50;

/** Accepts only a real calendar date "yyyy-mm-dd". */
function dateParam(v: string | undefined) {
  if (!v || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  const d = new Date(`${v}T00:00:00Z`);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== v ? null : v;
}

export default async function TransactionsPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const { supabase, org } = await requireOrg();
  const page = pageParam(params);
  const q = searchTerm(param(params, "q"));
  const type = param(params, "type");
  const from = dateParam(param(params, "from"));
  const to = dateParam(param(params, "to"));

  let query = supabase.from("transactions").select("*, customers(name)", { count: "exact" }).eq("organization_id", org.id);
  if (q) query = query.or(`product_or_service.ilike.%${q}%,owner_name.ilike.%${q}%`);
  if (type) query = query.eq("type", type);
  if (from) query = query.gte("date", from);
  if (to) query = query.lte("date", to);
  const { data, count } = await query
    .order("date", { ascending: false })
    .order("created_at", { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  const rows = (data ?? []) as Transaction[];
  const { count: total } = await supabase.from("transactions").select("id", { count: "exact", head: true }).eq("organization_id", org.id);

  return (
    <PageContainer>
      <PageHeader title="כסף ומכירות" description="כל המכירות, התשלומים וההחזרים במקום אחד." actions={<NewRecordButton entity="transactions" />} />
      {!total ? (
        <EmptyState
          icon={Receipt}
          title="אין עדיין מכירות"
          description="כאן יופיעו כל המכירות והתשלומים. העלה קובץ אקסל עם המכירות שלך, ותקבל מיד תמונה של ההכנסות."
          importCta
          action={<NewRecordButton entity="transactions" variant="outline" />}
        />
      ) : (
        <>
          {(from || to) && (
            <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-brand/15 bg-brand-soft/60 px-4 py-3 shadow-xs">
              <p className="min-w-0 flex-1 text-sm font-medium">
                {from && to ? (
                  <>
                    מכירות מ-<Ltr>{formatDate(from)}</Ltr> עד <Ltr>{formatDate(to)}</Ltr>
                  </>
                ) : from ? (
                  <>
                    מכירות מ-<Ltr>{formatDate(from)}</Ltr> והלאה
                  </>
                ) : (
                  <>
                    מכירות עד <Ltr>{formatDate(to)}</Ltr>
                  </>
                )}
              </p>
              <Button asChild size="xs" variant="ghost">
                <Link href="/transactions">
                  <X />
                  כל התאריכים
                </Link>
              </Button>
            </div>
          )}
          <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <SearchInput placeholder="חיפוש לפי מוצר, שירות או עובד…" />
            <FilterTabs
              param="type"
              options={[
                { value: "", label: "הכל" },
                { value: "sale", label: "מכירות" },
                { value: "subscription", label: "מנויים" },
                { value: "refund", label: "החזרים" },
              ]}
            />
          </div>
          {rows.length ? (
            <div className="overflow-hidden rounded-xl border bg-surface shadow-sm">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="ps-4">תאריך</TableHead>
                    <TableHead>לקוח</TableHead>
                    <TableHead className="hidden md:table-cell">מוצר / שירות</TableHead>
                    <TableHead className="hidden lg:table-cell">טופל על ידי</TableHead>
                    <TableHead className="hidden sm:table-cell">סטטוס</TableHead>
                    <TableHead className="pe-4 text-end">סכום</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((t) => (
                    <TableRow key={t.id}>
                      <TableCell className="ps-4 text-muted-foreground tabular">{formatDate(t.date)}</TableCell>
                      <TableCell className="max-w-[220px]">
                        {t.customer_id ? (
                          <Link href={`/customers/${t.customer_id}`} className="block truncate font-medium hover:text-brand">
                            {t.customers?.name ?? "לקוח"}
                          </Link>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="hidden md:table-cell">{t.product_or_service ?? "—"}</TableCell>
                      <TableCell className="hidden text-muted-foreground lg:table-cell">{t.owner_name ?? "—"}</TableCell>
                      <TableCell className="hidden sm:table-cell">
                        <Badge variant={t.type === "refund" ? "negative" : t.status === "pending" ? "warning" : "default"} >
                          {t.type === "refund" ? TRANSACTION_TYPE_LABELS.refund : label(TRANSACTION_STATUS_LABELS, t.status)}
                        </Badge>
                      </TableCell>
                      <TableCell className="pe-4 text-end font-medium tabular">
                        <Ltr>{formatCurrency(t.type === "refund" ? -t.amount : t.amount, org.currency)}</Ltr>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <EmptyState compact icon={Receipt} title="לא נמצאו מכירות" description="נסה חיפוש אחר או סינון אחר." />
          )}
          <Pagination page={page} pageSize={PAGE_SIZE} total={count ?? 0} />
        </>
      )}
    </PageContainer>
  );
}
