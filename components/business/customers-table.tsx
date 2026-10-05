"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ListPlus, X } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { BulkTaskDialog } from "./bulk-task-dialog";
import { useMoney } from "@/components/layout/workspace-provider";
import { formatCurrency, formatNumber, plural, relativeDays } from "@/lib/utils";
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
          <span className="text-sm font-medium tabular">{plural(selected.size, "נבחר", "נבחרו", "נבחר אחד")}</span>
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
                  <Link href={`/customers/${r.id}`} className="block truncate font-medium hover:text-brand">
                    {r.name}
                  </Link>
                  <span className="block truncate text-xs text-muted-foreground">{r.note ?? r.company ?? ""}</span>
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
                <TableCell className="hidden text-muted-foreground lg:table-cell">{relativeDays(r.last_purchase)}</TableCell>
                <TableCell className="hidden text-end tabular lg:table-cell">{formatNumber(r.purchases)}</TableCell>
                <TableCell className="pe-4 text-end font-medium tabular">
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
