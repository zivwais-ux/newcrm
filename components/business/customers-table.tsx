"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ListPlus, X } from "@phosphor-icons/react";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { WhatsAppButton } from "./whatsapp-button";
import { BulkTaskDialog } from "./bulk-task-dialog";
import { useFields, useMoney } from "@/components/layout/workspace-provider";
import { formatFieldValue } from "@/lib/fields";
import { cn, formatCurrency, formatNumber, plural, relativeDays } from "@/lib/utils";
import { Ltr } from "@/components/ui/ltr";
import { CUSTOMER_STATUS_LABELS, label } from "./labels";

export interface CustomerRow {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  company: string | null;
  status: string;
  revenue: number;
  purchases: number;
  last_purchase: string | null;
  note?: string | null;
  /** The business's own field values; columns show for fields marked "הצג בטבלה". */
  custom_fields?: Record<string, unknown> | null;
}

export function CustomersTable({
  rows,
  allIds,
  defaultTaskTitle = "לחזור ללקוח",
}: {
  rows: CustomerRow[];
  /** Every id in the current segment (when known) — enables "select all in segment". */
  allIds?: string[];
  defaultTaskTitle?: string;
}) {
  const currency = useMoney();
  const fields = useFields("customers");
  const columns = useMemo(() => fields.filter((f) => f.show_in_list), [fields]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [dialog, setDialog] = useState(false);
  const pageIds = useMemo(() => rows.map((r) => r.id), [rows]);
  const allOnPage = pageIds.length > 0 && pageIds.every((id) => selected.has(id));
  const someOnPage = pageIds.some((id) => selected.has(id));

  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  return (
    <div>
      {selected.size > 0 && (
        <div className="sticky top-16 z-20 mb-3 flex flex-wrap items-center gap-2 rounded-xl border bg-surface px-3 py-2 shadow-md">
          <span className="text-sm font-medium num">{plural(selected.size, "נבחר", "נבחרו", "נבחר אחד")}</span>
          {allIds && allIds.length > selected.size && (
            <Button size="xs" variant="ghost" onClick={() => setSelected(new Set(allIds))}>
              בחר את כל ה־{formatNumber(allIds.length)}
            </Button>
          )}
          <Button size="xs" variant="ghost" onClick={() => setSelected(new Set())}>
            <X />
            נקה בחירה
          </Button>
          <Button size="sm" className="ms-auto" onClick={() => setDialog(true)}>
            <ListPlus />
            צור משימות מעקב
          </Button>
        </div>
      )}
      <div className="overflow-hidden rounded-xl border bg-surface shadow-sm">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="ps-4">
                <Checkbox
                  checked={allOnPage ? true : someOnPage ? "indeterminate" : false}
                  onCheckedChange={(v) =>
                    setSelected((s) => {
                      const n = new Set(s);
                      for (const id of pageIds) {
                        if (v) n.add(id);
                        else n.delete(id);
                      }
                      return n;
                    })
                  }
                  aria-label="בחר את כל הלקוחות בעמוד"
                />
              </TableHead>
              <TableHead>לקוח</TableHead>
              <TableHead className="hidden md:table-cell">פרטי קשר</TableHead>
              <TableHead className="hidden sm:table-cell">סטטוס</TableHead>
              {columns.map((f) => (
                <TableHead key={f.key} className="hidden max-w-[160px] lg:table-cell">
                  <span dir="auto" className="block truncate">
                    {f.label}
                  </span>
                </TableHead>
              ))}
              <TableHead className="hidden lg:table-cell">קנייה אחרונה</TableHead>
              <TableHead className="hidden text-end lg:table-cell">קניות</TableHead>
              <TableHead className="pe-4 text-end">הכנסות</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.id} data-state={selected.has(r.id) ? "selected" : undefined}>
                <TableCell className="ps-4">
                  <Checkbox checked={selected.has(r.id)} onCheckedChange={() => toggle(r.id)} aria-label={`בחר את ${r.name}`} />
                </TableCell>
                <TableCell className="max-w-[260px]">
                  <div className="flex items-center gap-1.5">
                    <div className="min-w-0 flex-1">
                      <Link href={`/customers/${r.id}`} className="block truncate font-medium hover:text-brand">
                        {r.name}
                      </Link>
                      <span className="block truncate text-xs text-muted-foreground">{r.note ?? r.company ?? ""}</span>
                    </div>
                    {r.phone && <WhatsAppButton phone={r.phone} name={r.name} customerId={r.id} />}
                  </div>
                </TableCell>
                <TableCell className="hidden max-w-[220px] md:table-cell">
                  <span className="block truncate text-[13px]">{r.email ? <Ltr>{r.email}</Ltr> : "—"}</span>
                  <span className="block truncate text-xs text-muted-foreground">{r.phone ? <Ltr>{r.phone}</Ltr> : ""}</span>
                </TableCell>
                <TableCell className="hidden sm:table-cell">
                  <Badge variant={r.status === "active" ? "positive" : r.status === "churned" ? "negative" : "default"} >
                    {label(CUSTOMER_STATUS_LABELS, r.status)}
                  </Badge>
                </TableCell>
                {columns.map((f) => {
                  const text = formatFieldValue(f, r.custom_fields?.[f.key], currency);
                  const numeric = f.type === "number" || f.type === "money" || f.type === "phone";
                  return (
                    <TableCell key={f.key} className={cn("hidden max-w-[160px] text-[13px] lg:table-cell", numeric && "num")}>
                      {text ? (
                        <span dir={numeric ? "ltr" : "auto"} className="block truncate" title={text}>
                          {text}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                  );
                })}
                <TableCell className="hidden text-muted-foreground lg:table-cell">{relativeDays(r.last_purchase)}</TableCell>
                <TableCell className="hidden text-end num lg:table-cell">{formatNumber(r.purchases)}</TableCell>
                <TableCell className="pe-4 text-end font-medium num">
                  <Ltr>{formatCurrency(r.revenue, currency)}</Ltr>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {dialog && (
        <BulkTaskDialog
          open
          onOpenChange={setDialog}
          customerIds={[...selected]}
          defaultTitle={defaultTaskTitle}
          onCreated={() => setSelected(new Set())}
        />
      )}
    </div>
  );
}
