import Link from "next/link";
import { Receipt, X } from "@phosphor-icons/react/dist/ssr";
import { requireOrg } from "@/lib/supabase/server";
import { resolveTerms } from "@/lib/terms";
import { PageContainer, PageHeader } from "@/components/layout/page";
import { FilterTabs, Pagination, SearchInput } from "@/components/business/list-controls";
import { EmptyState } from "@/components/business/empty-state";
import { NewRecordButton } from "@/components/business/record-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatCurrency, formatDate, formatNumber } from "@/lib/utils";
import { Ltr } from "@/components/ui/ltr";
import { LiveDot, Module, ModuleRail } from "@/components/ui/module";
import { TRANSACTION_STATUS_LABELS, TRANSACTION_TYPE_LABELS, label } from "@/components/business/labels";
import { pageParam, param, searchTerm, type SearchParams } from "@/lib/params";
import type { Transaction } from "@/types/domain";
import { loadFields } from "@/lib/stages";
import { formatFieldValue } from "@/lib/fields";

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
  const terms = resolveTerms(org.terms);
  const serviceHead = terms.service === "שירות" ? "מוצר / שירות" : terms.service;
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
  const [{ count: total }, fields] = await Promise.all([
    supabase.from("transactions").select("id", { count: "exact", head: true }).eq("organization_id", org.id),
    loadFields(supabase, org.id),
  ]);
  // The business's own fields marked "הצג בטבלה".
  const columns = fields.filter((f) => f.entity === "transactions" && f.show_in_list);

  const filtered = Boolean(q || type || from || to);

  return (
    <PageContainer>
      <PageHeader title={`כסף ו${terms.sales}`} description={`כל ה${terms.sales}, התשלומים וההחזרים במקום אחד.`} actions={<NewRecordButton entity="transactions" />} />
      <Module>
        <ModuleRail
          icon={<Receipt />}
          title={terms.sales}
          meta={total ? <span className="num">{formatNumber(count ?? 0)}</span> : undefined}
          actions={total ? <LiveDot state={filtered ? "filtered" : "live"} label={filtered ? "מסונן" : undefined} /> : undefined}
        />
        {!total ? (
          <EmptyState
            icon={Receipt}
            title={`אין עדיין ${terms.sales}`}
            description={`כאן יופיעו כל ה${terms.sales} והתשלומים. העלה קובץ אקסל, ותקבל מיד תמונה של ההכנסות.`}
            importCta
            action={<NewRecordButton entity="transactions" variant="outline" />}
          />
        ) : (
          <>
            {(from || to) && (
              <div className="flex flex-wrap items-center gap-3 border-b border-border bg-brand-soft/50 px-3.5 py-2">
                <p className="min-w-0 flex-1 text-[13px] font-medium">
                  {from && to ? (
                    <>
                      {terms.sales} מ-<Ltr>{formatDate(from)}</Ltr> עד <Ltr>{formatDate(to)}</Ltr>
                    </>
                  ) : from ? (
                    <>
                      {terms.sales} מ-<Ltr>{formatDate(from)}</Ltr> והלאה
                    </>
                  ) : (
                    <>
                      {terms.sales} עד <Ltr>{formatDate(to)}</Ltr>
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
            <div className="flex flex-col gap-2 border-b border-border px-3.5 py-2.5 sm:flex-row sm:items-center sm:justify-between">
              <SearchInput placeholder={terms.service === "שירות" ? "חיפוש לפי מוצר, שירות או עובד…" : `חיפוש לפי ${terms.service} או עובד…`} />
              <FilterTabs
                param="type"
                options={[
                  { value: "", label: "הכל" },
                  { value: "sale", label: terms.sales },
                  { value: "subscription", label: "מנויים" },
                  { value: "refund", label: "החזרים" },
                ]}
              />
            </div>
            {rows.length ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="ps-4">תאריך</TableHead>
                    <TableHead>{terms.customer}</TableHead>
                    <TableHead className="hidden md:table-cell">{serviceHead}</TableHead>
                    <TableHead className="hidden lg:table-cell">טופל על ידי</TableHead>
                    <TableHead className="hidden sm:table-cell">סטטוס</TableHead>
                    {columns.map((f) => (
                      <TableHead key={f.key} className="hidden max-w-[160px] lg:table-cell">
                        <span dir="auto" className="block truncate">
                          {f.label}
                        </span>
                      </TableHead>
                    ))}
                    <TableHead className="pe-4 text-end">סכום</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((t) => (
                    <TableRow key={t.id}>
                      <TableCell className="ps-4 text-[13px] text-muted-foreground tabular">{formatDate(t.date)}</TableCell>
                      <TableCell className="max-w-[220px]">
                        {t.customer_id ? (
                          <Link href={`/customers/${t.customer_id}`} className="block truncate font-medium hover:text-brand">
                            {t.customers?.name ?? terms.customer}
                          </Link>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="hidden md:table-cell">{t.product_or_service ?? "—"}</TableCell>
                      <TableCell className="hidden text-muted-foreground lg:table-cell">{t.owner_name ?? "—"}</TableCell>
                      <TableCell className="hidden sm:table-cell">
                        <Badge variant={t.type === "refund" ? "negative" : t.status === "pending" ? "warning" : "default"}>
                          {t.type === "refund" ? TRANSACTION_TYPE_LABELS.refund : label(TRANSACTION_STATUS_LABELS, t.status)}
                        </Badge>
                      </TableCell>
                      {columns.map((f) => {
                        const text = formatFieldValue(f, t.custom_fields?.[f.key], org.currency);
                        const ltr = f.type === "number" || f.type === "money" || f.type === "phone";
                        return (
                          <TableCell key={f.key} className={ltr ? "num hidden max-w-[160px] text-[13px] lg:table-cell" : "hidden max-w-[160px] text-[13px] lg:table-cell"}>
                            {text ? (
                              <span dir={ltr ? "ltr" : "auto"} className="block truncate" title={text}>
                                {text}
                              </span>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </TableCell>
                        );
                      })}
                      <TableCell className="num pe-4 text-end font-medium">
                        <Ltr>{formatCurrency(t.type === "refund" ? -t.amount : t.amount, org.currency)}</Ltr>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <EmptyState compact icon={Receipt} title={`לא נמצאו ${terms.sales}`} description="נסה חיפוש אחר או סינון אחר." />
            )}
            <Pagination page={page} pageSize={PAGE_SIZE} total={count ?? 0} />
          </>
        )}
      </Module>
    </PageContainer>
  );
}
