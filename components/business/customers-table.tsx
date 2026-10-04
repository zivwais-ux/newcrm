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
import { formatCurrency, relativeDays } from "@/lib/utils";

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
  defaultTaskTitle = "Follow up",
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
        <div className="sticky top-14 z-20 mb-3 flex flex-wrap items-center gap-2 rounded-md border bg-surface px-3 py-2 shadow-sm">
          <span className="text-sm font-medium tabular">{selected.size} selected</span>
          {allIds && allIds.length > selected.size && (
            <Button size="xs" variant="ghost" onClick={() => setSelected(new Set(allIds))}>
              Select all {allIds.length}
            </Button>
          )}
          <Button size="xs" variant="ghost" onClick={() => setSelected(new Set())}>
            <X />
            Clear
          </Button>
          <Button size="sm" className="ml-auto" onClick={() => setDialog(true)}>
            <ListPlus />
            Create Follow-up Tasks
          </Button>
        </div>
      )}
      <div className="rounded-lg border bg-surface">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="pl-4">
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
                  aria-label="Select all on this page"
                />
              </TableHead>
              <TableHead>Customer</TableHead>
              <TableHead className="hidden md:table-cell">Contact</TableHead>
              <TableHead className="hidden sm:table-cell">Status</TableHead>
              <TableHead className="hidden lg:table-cell">Last purchase</TableHead>
              <TableHead className="hidden text-right lg:table-cell">Purchases</TableHead>
              <TableHead className="pr-4 text-right">Revenue</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.id} data-state={selected.has(r.id) ? "selected" : undefined}>
                <TableCell className="pl-4">
                  <Checkbox checked={selected.has(r.id)} onCheckedChange={() => toggle(r.id)} aria-label={`Select ${r.name}`} />
                </TableCell>
                <TableCell className="max-w-[260px]">
                  <Link href={`/customers/${r.id}`} className="block truncate font-medium hover:underline">
                    {r.name}
                  </Link>
                  <span className="block truncate text-xs text-muted-foreground">{r.note ?? r.company ?? ""}</span>
                </TableCell>
                <TableCell className="hidden max-w-[220px] md:table-cell">
                  <span className="block truncate text-[13px]">{r.email ?? "—"}</span>
                  <span className="block truncate text-xs text-muted-foreground">{r.phone ?? ""}</span>
                </TableCell>
                <TableCell className="hidden sm:table-cell">
                  <Badge variant={r.status === "active" ? "positive" : r.status === "churned" ? "negative" : "default"} className="capitalize">
                    {r.status}
                  </Badge>
                </TableCell>
                <TableCell className="hidden text-muted-foreground lg:table-cell">{relativeDays(r.last_purchase)}</TableCell>
                <TableCell className="hidden text-right tabular lg:table-cell">{r.purchases}</TableCell>
                <TableCell className="pr-4 text-right font-medium tabular">{formatCurrency(r.revenue, currency)}</TableCell>
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
