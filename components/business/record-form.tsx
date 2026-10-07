"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CircleNotch, Plus } from "@phosphor-icons/react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EntityPicker } from "./entity-picker";
import { useStages, useTerms, useWorkspace } from "@/components/layout/workspace-provider";
import type { Terms } from "@/lib/terms";
import { createRecord, updateRecord, type RecordEntity } from "@/lib/actions/records";
import { ACTIVITY_TYPES, DEAL_STAGES } from "@/types/domain";
import { isoDate } from "@/lib/utils";
import {
  STAGE_LABELS,
  ACTIVITY_TYPE_LABELS,
  CUSTOMER_STATUS_LABELS,
  LEAD_STATUS_LABELS,
  TRANSACTION_STATUS_LABELS,
  TRANSACTION_TYPE_LABELS,
} from "./labels";

type FieldType = "text" | "email" | "tel" | "money" | "date" | "datetime" | "select" | "textarea" | "customer" | "deal" | "member";

interface Field {
  name: string;
  label: string;
  type: FieldType;
  required?: boolean;
  options?: readonly string[];
  placeholder?: string;
  optionLabels?: Record<string, string>;
  half?: boolean;
}

interface FormSpec {
  /** Hebrew noun, e.g. "לקוח". */
  singular: string;
  /** "לקוח חדש" — dialog title and menu label. */
  newLabel: string;
  /** "עריכת לקוח" */
  editLabel: string;
  /** Submit button on create, e.g. "הוסף לקוח". */
  createLabel: string;
  /** Toast after create. */
  createdToast: string;
  description: string;
  fields: Field[];
}

export const RECORD_FORMS: Record<RecordEntity, FormSpec> = {
  customers: {
    singular: "לקוח",
    newLabel: "לקוח חדש",
    editLabel: "עריכת לקוח",
    createLabel: "הוסף לקוח",
    createdToast: "הלקוח נוסף",
    description: "מישהו שאתה עובד איתו או מוכר לו.",
    fields: [
      { name: "name", label: "שם", type: "text", required: true, placeholder: "דוד כהן" },
      { name: "email", label: "אימייל", type: "email", half: true },
      { name: "phone", label: "טלפון", type: "tel", half: true },
      { name: "company", label: "חברה", type: "text", half: true },
      { name: "status", label: "סטטוס", type: "select", options: ["active", "inactive", "churned"], optionLabels: CUSTOMER_STATUS_LABELS, half: true },
    ],
  },
  leads: {
    singular: "פנייה",
    newLabel: "פנייה חדשה",
    editLabel: "עריכת פנייה",
    createLabel: "הוסף פנייה",
    createdToast: "הפנייה נוספה",
    description: "מישהו שהתעניין ועוד לא הפך ללקוח.",
    fields: [
      { name: "name", label: "שם", type: "text", required: true },
      { name: "email", label: "אימייל", type: "email", half: true },
      { name: "phone", label: "טלפון", type: "tel", half: true },
      { name: "source", label: "מקור", type: "text", placeholder: "אתר, המלצה, פייסבוק…", half: true },
      { name: "value", label: "שווי משוער", type: "money", half: true },
      { name: "status", label: "סטטוס", type: "select", options: ["new", "contacted", "qualified", "converted", "lost"], optionLabels: LEAD_STATUS_LABELS, half: true },
      { name: "owner_id", label: "באחריות", type: "member", half: true },
    ],
  },
  deals: {
    singular: "עסקה",
    newLabel: "עסקה חדשה",
    editLabel: "עריכת עסקה",
    createLabel: "הוסף עסקה",
    createdToast: "העסקה נוספה",
    description: "הזדמנות למכירה שאתה עובד עליה.",
    fields: [
      { name: "name", label: "שם העסקה", type: "text", required: true, placeholder: "למשל: חבילת טיפולים לחברת אקמה" },
      { name: "customer_id", label: "לקוח", type: "customer" },
      { name: "value", label: "שווי", type: "money", half: true },
      { name: "stage", label: "שלב", type: "select", options: DEAL_STAGES, optionLabels: STAGE_LABELS, half: true },
      { name: "expected_close", label: "צפי לסגירה", type: "date", half: true },
      { name: "owner_id", label: "באחריות", type: "member", half: true },
    ],
  },
  transactions: {
    singular: "מכירה",
    newLabel: "מכירה חדשה",
    editLabel: "עריכת מכירה",
    createLabel: "הוסף מכירה",
    createdToast: "המכירה נוספה",
    description: "מכירה, תשלום או החזר כספי.",
    fields: [
      { name: "customer_id", label: "לקוח", type: "customer" },
      { name: "amount", label: "סכום", type: "money", required: true, half: true },
      { name: "date", label: "תאריך", type: "date", required: true, half: true },
      { name: "product_or_service", label: "מוצר / שירות", type: "text" },
      { name: "type", label: "סוג", type: "select", options: ["sale", "refund", "subscription"], optionLabels: TRANSACTION_TYPE_LABELS, half: true },
      { name: "status", label: "סטטוס", type: "select", options: ["paid", "pending", "cancelled"], optionLabels: TRANSACTION_STATUS_LABELS, half: true },
    ],
  },
  activities: {
    singular: "פעילות",
    newLabel: "פעילות חדשה",
    editLabel: "עריכת פעילות",
    createLabel: "הוסף פעילות",
    createdToast: "הפעילות נרשמה",
    description: "תור, שיחה, פגישה או הערה.",
    fields: [
      { name: "type", label: "סוג", type: "select", options: ACTIVITY_TYPES, optionLabels: ACTIVITY_TYPE_LABELS, half: true },
      { name: "date", label: "תאריך ושעה", type: "datetime", required: true, half: true },
      { name: "customer_id", label: "לקוח", type: "customer" },
      { name: "notes", label: "הערות", type: "textarea" },
    ],
  },
  tasks: {
    singular: "משימה",
    newLabel: "משימה חדשה",
    editLabel: "עריכת משימה",
    createLabel: "הוסף משימה",
    createdToast: "המשימה נוספה",
    description: "משהו שצריך לעשות.",
    fields: [
      { name: "title", label: "מה צריך לעשות?", type: "text", required: true, placeholder: "להתקשר ולקבוע ביקור הבא" },
      { name: "customer_id", label: "לקוח", type: "customer" },
      { name: "due_date", label: "תאריך יעד", type: "date", half: true },
      { name: "assigned_to", label: "באחריות", type: "member", half: true },
      { name: "description", label: "הערות", type: "textarea" },
    ],
  },
};

/**
 * The form spec in the business's own words ("מטופל", "טיפול"…). Phrasing stays gender-neutral
 * ("הוספת X", "עריכת X") because the business's noun can be masculine or feminine.
 */
export function recordForm(entity: RecordEntity, t: Terms): FormSpec {
  const base = RECORD_FORMS[entity];
  const named = (noun: string, toast: string, description = base.description): Partial<FormSpec> => ({
    singular: noun,
    newLabel: `הוספת ${noun}`,
    editLabel: `עריכת ${noun}`,
    createLabel: `הוסף ${noun}`,
    createdToast: toast,
    description,
  });
  const relabel = (f: Field): Field => {
    if (f.type === "customer") return { ...f, label: t.customer };
    if (f.name === "product_or_service") return { ...f, label: t.service === "שירות" ? f.label : t.service };
    if (entity === "activities" && f.name === "type") return { ...f, optionLabels: { ...f.optionLabels, appointment: t.appointment } };
    if (entity === "deals" && f.name === "name") return { ...f, label: "שם" };
    return f;
  };
  const words: Partial<Record<RecordEntity, Partial<FormSpec>>> = {
    customers: named(t.customer, "נוסף לרשימה"),
    leads: { description: `מישהו שהתעניין ועוד לא נהיה ${t.customer}.` },
    deals: named(t.deal, "נשמר"),
    transactions: named(t.sale, "נשמר", `${t.sale}, תשלום או החזר כספי.`),
    activities: { description: `${t.appointment}, שיחה, פגישה או הערה.` },
  };
  return { ...base, ...words[entity], fields: base.fields.map(relabel) };
}

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
  const form = recordForm(entity, useTerms());
  // Deal stages are the business's own (order + names), not the built-in defaults.
  const stages = useStages();
  const stageOptions = stages.map((s) => s.key);
  const stageLabels = Object.fromEntries(stages.map((s) => [s.key, s.label]));
  const optionsFor = (f: Field) => (entity === "deals" && f.name === "stage" ? stageOptions : f.options ?? []);
  const labelsFor = (f: Field) => (entity === "deals" && f.name === "stage" ? stageLabels : f.optionLabels);
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
      toast.success(recordId ? "השינויים נשמרו" : form.createdToast);
      onOpenChange(false);
      onSaved?.(recordId ?? (res.data as { id: string }).id);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{recordId ? form.editLabel : form.newLabel}</DialogTitle>
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
                    <SelectValue placeholder="בחר" />
                  </SelectTrigger>
                  <SelectContent>
                    {optionsFor(f).map((o) => (
                      <SelectItem key={o} value={o}>
                        {labelsFor(f)?.[o] ?? o}
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
                        {m.full_name ?? "חבר צוות"}
                        {m.user_id === user.id ? " (אני)" : ""}
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
                <Textarea id={`f-${f.name}`} dir="auto" rows={3} value={values[f.name] ?? ""} onChange={(e) => set(f.name, e.target.value)} />
              ) : (
                <Input
                  id={`f-${f.name}`}
                  type={f.type === "money" ? "number" : f.type === "datetime" ? "datetime-local" : f.type}
                  dir={f.type === "text" ? "auto" : "ltr"}
                  className={f.type === "text" ? undefined : "text-end"}
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
              ביטול
            </Button>
            <Button type="submit" disabled={pending}>
              {pending && <CircleNotch className="animate-spin" />}
              {recordId ? "שמור שינויים" : form.createLabel}
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
  const terms = useTerms();
  return (
    <>
      <Button variant={variant} size={size} onClick={() => setOpen(true)}>
        {children ?? (
          <>
            <Plus />
            {recordForm(entity, terms).newLabel}
          </>
        )}
      </Button>
      {open && <RecordFormDialog entity={entity} open={open} onOpenChange={setOpen} initial={initial} labels={labels} />}
    </>
  );
}
