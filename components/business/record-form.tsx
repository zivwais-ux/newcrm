"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EntityPicker } from "./entity-picker";
import { useWorkspace } from "@/components/layout/workspace-provider";
import { createRecord, updateRecord, type RecordEntity } from "@/lib/actions/records";
import { ACTIVITY_TYPES, DEAL_STAGES } from "@/types/domain";
import { isoDate } from "@/lib/utils";

type FieldType = "text" | "email" | "tel" | "money" | "date" | "datetime" | "select" | "textarea" | "customer" | "deal" | "member";

interface Field {
  name: string;
  label: string;
  type: FieldType;
  required?: boolean;
  options?: readonly string[];
  placeholder?: string;
  half?: boolean;
}

const cap = (s: string) => s[0].toUpperCase() + s.slice(1);

export const RECORD_FORMS: Record<RecordEntity, { singular: string; description: string; fields: Field[] }> = {
  customers: {
    singular: "customer",
    description: "Add someone you do business with.",
    fields: [
      { name: "name", label: "Name", type: "text", required: true, placeholder: "David Cohen" },
      { name: "email", label: "Email", type: "email", half: true },
      { name: "phone", label: "Phone", type: "tel", half: true },
      { name: "company", label: "Company", type: "text", half: true },
      { name: "status", label: "Status", type: "select", options: ["active", "inactive", "churned"], half: true },
    ],
  },
  leads: {
    singular: "lead",
    description: "A potential customer you're talking to.",
    fields: [
      { name: "name", label: "Name", type: "text", required: true },
      { name: "email", label: "Email", type: "email", half: true },
      { name: "phone", label: "Phone", type: "tel", half: true },
      { name: "source", label: "Source", type: "text", placeholder: "Website, referral…", half: true },
      { name: "value", label: "Estimated value", type: "money", half: true },
      { name: "status", label: "Status", type: "select", options: ["new", "contacted", "qualified", "converted", "lost"], half: true },
      { name: "owner_id", label: "Owner", type: "member", half: true },
    ],
  },
  deals: {
    singular: "deal",
    description: "An opportunity in your pipeline.",
    fields: [
      { name: "name", label: "Deal name", type: "text", required: true, placeholder: "Acme — website redesign" },
      { name: "customer_id", label: "Customer", type: "customer" },
      { name: "value", label: "Value", type: "money", half: true },
      { name: "stage", label: "Stage", type: "select", options: DEAL_STAGES, half: true },
      { name: "expected_close", label: "Expected close", type: "date", half: true },
      { name: "owner_id", label: "Owner", type: "member", half: true },
    ],
  },
  transactions: {
    singular: "transaction",
    description: "A sale, payment or refund.",
    fields: [
      { name: "customer_id", label: "Customer", type: "customer" },
      { name: "amount", label: "Amount", type: "money", required: true, half: true },
      { name: "date", label: "Date", type: "date", required: true, half: true },
      { name: "product_or_service", label: "Product / service", type: "text" },
      { name: "type", label: "Type", type: "select", options: ["sale", "refund", "subscription"], half: true },
      { name: "status", label: "Status", type: "select", options: ["paid", "pending", "cancelled"], half: true },
    ],
  },
  activities: {
    singular: "activity",
    description: "An appointment, call, meeting or note.",
    fields: [
      { name: "type", label: "Type", type: "select", options: ACTIVITY_TYPES, half: true },
      { name: "date", label: "Date & time", type: "datetime", required: true, half: true },
      { name: "customer_id", label: "Customer", type: "customer" },
      { name: "notes", label: "Notes", type: "textarea" },
    ],
  },
  tasks: {
    singular: "task",
    description: "Something that needs to get done.",
    fields: [
      { name: "title", label: "Title", type: "text", required: true, placeholder: "Call to schedule next visit" },
      { name: "customer_id", label: "Customer", type: "customer" },
      { name: "due_date", label: "Due date", type: "date", half: true },
      { name: "assigned_to", label: "Assigned to", type: "member", half: true },
      { name: "description", label: "Notes", type: "textarea" },
    ],
  },
};

function defaults(entity: RecordEntity): Record<string, string> {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  switch (entity) {
    case "customers":
      return { status: "active" };
    case "leads":
      return { status: "new" };
    case "deals":
      return { stage: "new" };
    case "transactions":
      return { date: isoDate(now), type: "sale", status: "paid" };
    case "activities":
      return { type: "appointment", date: local };
    case "tasks":
      return { due_date: isoDate(new Date(now.getTime() + 2 * 86400000)) };
  }
}

export function RecordFormDialog({
  entity,
  open,
  onOpenChange,
  recordId,
  initial,
  labels,
  onSaved,
}: {
  entity: RecordEntity;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  recordId?: string;
  initial?: Record<string, string | number | null | undefined>;
  labels?: { customer_id?: string | null; deal_id?: string | null };
  onSaved?: (id: string) => void;
}) {
  const router = useRouter();
  const { members, user } = useWorkspace();
  const form = RECORD_FORMS[entity];
  const [values, setValues] = useState<Record<string, string>>(() => {
    const base = defaults(entity);
    for (const [k, v] of Object.entries(initial ?? {})) if (v !== null && v !== undefined) base[k] = String(v);
    if (base.date && entity === "activities" && base.date.length > 16) {
      const d = new Date(base.date);
      base.date = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    }
    return base;
  });
  const [pending, startTransition] = useTransition();
  const set = (k: string, v: string | null) => setValues((s) => ({ ...s, [k]: v ?? "" }));

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const payload: Record<string, unknown> = { ...values };
    if (entity === "activities" && values.date) payload.date = new Date(values.date).toISOString();
    startTransition(async () => {
      const res = recordId
        ? await updateRecord(entity, recordId, payload as never)
        : await createRecord(entity, payload as never);
      if (!res.ok) return void toast.error(res.error);
      toast.success(recordId ? `${cap(form.singular)} updated` : `${cap(form.singular)} created`);
      onOpenChange(false);
      onSaved?.(recordId ?? (res.data as { id: string }).id);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{recordId ? `Edit ${form.singular}` : `New ${form.singular}`}</DialogTitle>
          <DialogDescription>{form.description}</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="grid grid-cols-2 gap-x-3 gap-y-4">
          {form.fields.map((f) => (
            <div key={f.name} className={f.half ? "col-span-2 space-y-1.5 sm:col-span-1" : "col-span-2 space-y-1.5"}>
              <Label htmlFor={`f-${f.name}`}>
                {f.label}
                {f.required && <span className="text-muted-foreground"> *</span>}
              </Label>
              {f.type === "select" ? (
                <Select value={values[f.name] ?? ""} onValueChange={(v) => set(f.name, v)}>
                  <SelectTrigger id={`f-${f.name}`}>
                    <SelectValue placeholder="Select" />
                  </SelectTrigger>
                  <SelectContent>
                    {f.options!.map((o) => (
                      <SelectItem key={o} value={o}>
                        {cap(o)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : f.type === "member" ? (
                <Select value={values[f.name] || user.id} onValueChange={(v) => set(f.name, v)}>
                  <SelectTrigger id={`f-${f.name}`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {members.map((m) => (
                      <SelectItem key={m.user_id} value={m.user_id}>
                        {m.full_name ?? "Teammate"}
                        {m.user_id === user.id ? " (you)" : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : f.type === "customer" || f.type === "deal" ? (
                <EntityPicker
                  kind={f.type}
                  value={values[f.name] || null}
                  initialLabel={f.type === "customer" ? labels?.customer_id : labels?.deal_id}
                  onChange={(id) => set(f.name, id)}
                />
              ) : f.type === "textarea" ? (
                <Textarea id={`f-${f.name}`} value={values[f.name] ?? ""} onChange={(e) => set(f.name, e.target.value)} />
              ) : (
                <Input
                  id={`f-${f.name}`}
                  type={f.type === "money" ? "number" : f.type === "datetime" ? "datetime-local" : f.type}
                  step={f.type === "money" ? "0.01" : undefined}
                  min={f.type === "money" ? 0 : undefined}
                  inputMode={f.type === "money" ? "decimal" : undefined}
                  required={f.required}
                  placeholder={f.placeholder}
                  value={values[f.name] ?? ""}
                  onChange={(e) => set(f.name, e.target.value)}
                />
              )}
            </div>
          ))}
          <DialogFooter className="col-span-2 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending && <Loader2 className="animate-spin" />}
              {recordId ? "Save changes" : `Create ${form.singular}`}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Button that opens a create dialog for an entity. */
export function NewRecordButton({
  entity,
  initial,
  labels,
  children,
  variant = "default",
  size = "sm",
}: {
  entity: RecordEntity;
  initial?: Record<string, string | number | null | undefined>;
  labels?: { customer_id?: string | null };
  children?: React.ReactNode;
  variant?: "default" | "outline" | "ghost";
  size?: "sm" | "default" | "xs";
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant={variant} size={size} onClick={() => setOpen(true)}>
        {children ?? `New ${RECORD_FORMS[entity].singular}`}
      </Button>
      {open && <RecordFormDialog entity={entity} open={open} onOpenChange={setOpen} initial={initial} labels={labels} />}
    </>
  );
}
