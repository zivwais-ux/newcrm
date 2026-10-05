"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { RecordFormDialog } from "./record-form";
import { useWorkspace } from "@/components/layout/workspace-provider";
import { formatCurrency, relativeDays } from "@/lib/utils";
import { Ltr } from "@/components/ui/ltr";
import { LEAD_STATUS_LABELS, label } from "./labels";
import type { Lead } from "@/types/domain";

const STATUS_VARIANT = { new: "brand", contacted: "default", qualified: "positive", converted: "positive", lost: "outline" } as const;

export function LeadsTable({ leads }: { leads: Lead[] }) {
  const { org, members } = useWorkspace();
  const [editing, setEditing] = useState<Lead | null>(null);
  return (
    <div className="overflow-hidden rounded-xl border bg-surface shadow-sm">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="ps-4">פנייה</TableHead>
            <TableHead className="hidden md:table-cell">פרטי קשר</TableHead>
            <TableHead>סטטוס</TableHead>
            <TableHead className="hidden sm:table-cell">מקור</TableHead>
            <TableHead className="hidden lg:table-cell">באחריות</TableHead>
            <TableHead className="hidden lg:table-cell">עודכנה</TableHead>
            <TableHead className="pe-4 text-end">שווי</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {leads.map((l) => (
            <TableRow key={l.id} className="cursor-pointer" onClick={() => setEditing(l)}>
              <TableCell className="max-w-[240px] ps-4">
                <span className="block truncate font-medium">{l.name}</span>
                <span className="block truncate text-xs text-muted-foreground">{(l.custom_fields?.company as string) ?? ""}</span>
              </TableCell>
              <TableCell className="hidden max-w-[220px] md:table-cell">
                <span className="block truncate text-[13px]">{l.email ? <Ltr>{l.email}</Ltr> : "—"}</span>
                <span className="block truncate text-xs text-muted-foreground">{l.phone ? <Ltr>{l.phone}</Ltr> : ""}</span>
              </TableCell>
              <TableCell>
                <Badge variant={STATUS_VARIANT[l.status]} >
                  {label(LEAD_STATUS_LABELS, l.status)}
                </Badge>
              </TableCell>
              <TableCell className="hidden text-muted-foreground sm:table-cell">{l.source ?? "—"}</TableCell>
              <TableCell className="hidden text-muted-foreground lg:table-cell">
                {(l.custom_fields?.owner_name as string) ?? members.find((m) => m.user_id === l.owner_id)?.full_name ?? "—"}
              </TableCell>
              <TableCell className="hidden text-muted-foreground lg:table-cell">{relativeDays(l.updated_at)}</TableCell>
              <TableCell className="pe-4 text-end tabular">{l.value ? <Ltr>{formatCurrency(l.value, org.currency)}</Ltr> : "—"}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {editing && (
        <RecordFormDialog
          key={editing.id}
          entity="leads"
          open
          onOpenChange={(o) => !o && setEditing(null)}
          recordId={editing.id}
          initial={{ name: editing.name, email: editing.email, phone: editing.phone, source: editing.source, status: editing.status, value: editing.value, owner_id: editing.owner_id }}
        />
      )}
    </div>
  );
}
