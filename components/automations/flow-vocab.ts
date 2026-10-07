import { useMemo } from "react";
import { useStageLabel, useTerms, useWorkspace } from "@/components/layout/workspace-provider";
import {
  ACTIVITY_TYPE_LABELS,
  CUSTOMER_STATUS_LABELS,
  LEAD_STATUS_LABELS,
  TASK_STATUS_LABELS,
  TRANSACTION_STATUS_LABELS,
} from "@/components/business/labels";
import { CONDITION_FIELDS, automationSchema, subjectOf, type Action, type Automation, type Condition, type Operator, type Subject, type Trigger } from "@/lib/automations/schema";
import type { DescribeContext } from "@/lib/automations/describe";
import type { FieldDef } from "@/lib/fields";
import type { StageDef } from "@/types/domain";
import type { Terms } from "@/lib/terms";

// Plain-Hebrew vocabulary for the flow studio: what each choice is called, which values it can take,
// and the small checks that tell people what is still missing. No jargon reaches the screen.

/** The flow being edited. Same shape as the stored automation; text may still be empty while editing. */
export type Draft = Pick<Automation, "name" | "trigger" | "conditions" | "wait" | "actions">;

export interface Option {
  value: string;
  label: string;
  hint?: string;
}

const toOptions = (map: Record<string, string>): Option[] => Object.entries(map).map(([value, label]) => ({ value, label }));

/** describe.ts context in the business's own words (terms, stage names, field names). */
export function useDescribeContext(): DescribeContext {
  const terms = useTerms();
  const stageLabel = useStageLabel();
  const { fields } = useWorkspace();
  return useMemo(
    () => ({
      terms,
      stageLabel: (k: string) => stageLabel(k),
      fieldLabel: (k: string) => fields?.find((f) => f.key === k)?.label ?? "שדה",
    }),
    [terms, stageLabel, fields],
  );
}

// ---------------------------------------------------------------------------
// WHEN

export const TRIGGER_TYPES = (t: Terms): Option[] => [
  { value: "record_created", label: "משהו חדש נוסף", hint: `${t.customer}, ${t.sale}, ${t.appointment}, פנייה…` },
  { value: "deal_stage", label: `${t.deal} עוברת שלב`, hint: `למשל כש${t.deal} נסגרת בהצלחה` },
  { value: "status_changed", label: "סטטוס משתנה", hint: `של פנייה או של ${t.sale}` },
  { value: "days_from_date", label: "מגיע תאריך", hint: `לפני ${t.appointment}, אחרי קנייה, ביום הולדת` },
  { value: "no_activity", label: "אין פעילות זמן מה", hint: `${t.customer} או ${t.deal} שנשכחו` },
];

export const ENTITY_OPTIONS = (t: Terms, only?: readonly Subject[]): Option[] =>
  (
    [
      { value: "customers", label: t.customer },
      { value: "transactions", label: t.sale },
      { value: "activities", label: t.appointment },
      { value: "leads", label: "פנייה" },
      { value: "deals", label: t.deal },
      { value: "tasks", label: "משימה" },
    ] satisfies Option[]
  ).filter((o) => !only || only.includes(o.value as Subject));

export const statusOptions = (entity: "leads" | "transactions"): Option[] =>
  toOptions(entity === "leads" ? LEAD_STATUS_LABELS : TRANSACTION_STATUS_LABELS);

export const ANCHOR_OPTIONS = (t: Terms): Option[] => [
  { value: "last_purchase", label: "הקנייה האחרונה" },
  { value: "appointment", label: `ה${t.appointment}` },
  { value: "custom_date", label: "תאריך משלי", hint: "שדה תאריך שהגדרת, כמו יום הולדת" },
];

/** A sensible starting point when the person switches the kind of WHEN. */
export function defaultTrigger(type: Trigger["type"], stages: StageDef[], dateFields: FieldDef[]): Trigger {
  switch (type) {
    case "record_created":
      return { type, entity: "transactions" };
    case "deal_stage":
      return { type, stage: stages.find((s) => s.kind === "won")?.key ?? stages[0]?.key ?? "won" };
    case "status_changed":
      return { type, entity: "leads", status: "new" };
    case "days_from_date":
      return dateFields.length
        ? { type, anchor: "custom_date", field: dateFields[0].key, days: 0, before: false }
        : { type, anchor: "last_purchase", days: 30, before: false };
    case "no_activity":
      return { type, entity: "customers", days: 30 };
  }
}

// ---------------------------------------------------------------------------
// IF

export const OP_LABELS: Record<Operator, string> = {
  eq: "שווה ל",
  neq: "לא",
  gt: "גדול מ",
  lt: "קטן מ",
  contains: "מכיל",
  empty: "ריק",
  not_empty: "לא ריק",
};

export const VALUELESS_OPS: readonly Operator[] = ["empty", "not_empty"];

export type ValueKind =
  | { kind: "bool" }
  | { kind: "number" }
  | { kind: "text" }
  | { kind: "enum"; options: Option[]; multi?: boolean }
  | { kind: "date" };

export interface FieldChoice extends Option {
  value: string;
  own?: boolean;
  valueKind: ValueKind;
}

const STATUS_BY_SUBJECT: Partial<Record<Subject, Record<string, string>>> = {
  customers: CUSTOMER_STATUS_LABELS,
  transactions: TRANSACTION_STATUS_LABELS,
  leads: LEAD_STATUS_LABELS,
  tasks: TASK_STATUS_LABELS,
};

/** What a condition can look at for this kind of record, in plain words, plus the business's own fields. */
export function conditionFields(subject: Subject, t: Terms, stages: StageDef[], own: FieldDef[]): FieldChoice[] {
  const builtIn: Record<string, Omit<FieldChoice, "value">> = {
    status: { label: "סטטוס", valueKind: { kind: "enum", options: toOptions(STATUS_BY_SUBJECT[subject] ?? {}) } },
    has_phone: { label: "יש טלפון", valueKind: { kind: "bool" } },
    purchases: { label: "מספר קניות", valueKind: { kind: "number" } },
    total_revenue: { label: "סך הקניות", valueKind: { kind: "number" } },
    days_since_purchase: { label: "ימים מהקנייה האחרונה", valueKind: { kind: "number" } },
    amount: { label: "סכום", valueKind: { kind: "number" } },
    service: { label: t.service, valueKind: { kind: "text" } },
    is_first_purchase: { label: "קנייה ראשונה", valueKind: { kind: "bool" } },
    type: {
      label: "סוג הפעילות",
      valueKind: {
        kind: "enum",
        options: Object.entries(ACTIVITY_TYPE_LABELS).map(([value, label]) => ({ value, label: value === "appointment" ? t.appointment : label })),
      },
    },
    source: { label: "מקור", valueKind: { kind: "text" } },
    stage: { label: "שלב", valueKind: { kind: "enum", options: stages.map((s) => ({ value: s.key, label: s.label })) } },
    value: { label: "שווי", valueKind: { kind: "number" } },
  };
  const list: FieldChoice[] = CONDITION_FIELDS[subject].filter((f) => builtIn[f]).map((f) => ({ value: f, ...builtIn[f] }));
  for (const f of own) {
    const valueKind: ValueKind =
      f.type === "number" || f.type === "money"
        ? { kind: "number" }
        : f.type === "checkbox"
          ? { kind: "bool" }
          : f.type === "date"
            ? { kind: "date" }
            : f.type === "select" || f.type === "multiselect"
              ? { kind: "enum", options: f.options.map((o) => ({ value: o, label: o })), multi: f.type === "multiselect" }
              : { kind: "text" };
    list.push({ value: `cf:${f.key}`, label: f.label, own: true, valueKind });
  }
  return list;
}

export function opsFor(kind: ValueKind): Operator[] {
  switch (kind.kind) {
    case "bool":
      return ["eq"];
    case "number":
      return ["eq", "gt", "lt", "empty", "not_empty"];
    case "text":
      return ["eq", "neq", "contains", "empty", "not_empty"];
    case "enum":
      return kind.multi ? ["contains", "empty", "not_empty"] : ["eq", "neq", "empty", "not_empty"];
    case "date":
      return ["not_empty", "empty"];
  }
}

/** A fresh condition on this field: the first operator that fits, and a starting value. */
export function conditionFor(choice: FieldChoice): Condition {
  const op = opsFor(choice.valueKind)[0];
  const value =
    choice.valueKind.kind === "bool" ? "true" : choice.valueKind.kind === "enum" ? (choice.valueKind.options[0]?.value ?? "") : "";
  return { field: choice.value, op, value };
}

// ---------------------------------------------------------------------------
// DO

export const ACTION_TYPES = (t: Terms): Option[] => [
  { value: "prepare_whatsapp", label: "הכן הודעת WhatsApp", hint: "מחכה לך לשליחה בלחיצה. לא נשלחת לבד." },
  { value: "create_task", label: "צור משימה", hint: "תזכורת לך או לצוות" },
  { value: "notify", label: "שלח התראה", hint: "תופיע בפעמון למעלה" },
  { value: "add_note", label: "הוסף הערה", hint: `נרשמת בכרטיס ה${t.customer}` },
  { value: "set_value", label: "עדכן ערך", hint: "סטטוס, שלב או שדה משלך" },
];

/** Switches the kind of action, keeping whatever text was already written. */
export function changeActionType(a: Action, type: Action["type"], subject: Subject, stages: StageDef[]): Action {
  const text = a.type === "create_task" || a.type === "notify" ? a.title : a.type === "prepare_whatsapp" ? a.body : a.type === "add_note" ? a.text : "";
  switch (type) {
    case "create_task":
      return { type, title: text, due_in_days: 0 };
    case "prepare_whatsapp":
      return { type, body: text };
    case "add_note":
      return { type, text };
    case "notify":
      return { type, title: text };
    case "set_value":
      return defaultSetValue(subject, stages);
  }
}

export function setValueTargets(subject: Subject, t: Terms, hasOwnFields: boolean): Option[] {
  const out: Option[] = [];
  if (subject !== "tasks") out.push({ value: "customer_status", label: `סטטוס ה${t.customer}` });
  if (subject === "leads") out.push({ value: "lead_status", label: "סטטוס הפנייה" });
  if (subject === "deals") out.push({ value: "deal_stage", label: `שלב ה${t.deal}` });
  if (hasOwnFields) out.push({ value: "custom_field", label: "שדה משלי" });
  return out;
}

export function defaultSetValue(subject: Subject, stages: StageDef[]): Action {
  if (subject === "deals") return { type: "set_value", target: "deal_stage", value: stages[0]?.key ?? "" };
  if (subject === "leads") return { type: "set_value", target: "lead_status", value: "contacted" };
  return { type: "set_value", target: "customer_status", value: "active" };
}

export const CUSTOMER_STATUS_OPTIONS = toOptions(CUSTOMER_STATUS_LABELS);
export const LEAD_STATUS_OPTIONS = toOptions(LEAD_STATUS_LABELS);

/** Placeholders the engine fills from the record, with the word people see on the chip. */
export const placeholderChips = (t: Terms) => [
  { token: "{שם}", label: "שם" },
  { token: "{שירות}", label: t.service },
  { token: "{סכום}", label: "סכום" },
  { token: "{תאריך}", label: "תאריך" },
  { token: "{שעה}", label: "שעה" },
  { token: "{עסק}", label: "שם העסק" },
];

// ---------------------------------------------------------------------------
// What's missing

export type NodeRef = { kind: "trigger" } | { kind: "condition"; i: number } | { kind: "wait" } | { kind: "action"; i: number };

export interface Issue {
  message: string;
  node?: NodeRef;
}

function conditionIssue(c: Condition): string | null {
  if (!VALUELESS_OPS.includes(c.op) && !c.value.trim()) return "השלם את התנאי: בחר ערך";
  return null;
}

function actionIssue(a: Action): string | null {
  switch (a.type) {
    case "create_task":
      return a.title.trim() ? null : "כתוב מה המשימה";
    case "prepare_whatsapp":
      return a.body.trim() ? null : "כתוב את ההודעה";
    case "add_note":
      return a.text.trim() ? null : "כתוב את ההערה";
    case "notify":
      return a.title.trim() ? null : "כתוב מה תגיד ההתראה";
    case "set_value":
      if (a.target === "custom_field" && !a.field) return "בחר איזה שדה לעדכן";
      return a.value.trim() ? null : "בחר ערך לעדכון";
  }
}

/** Per-node problems, so a node can say it still needs something. */
export function nodeIssue(d: Draft, ref: NodeRef): string | null {
  if (ref.kind === "trigger") {
    if (d.trigger.type === "days_from_date" && d.trigger.anchor === "custom_date" && !d.trigger.field) return "בחר שדה תאריך";
    return null;
  }
  if (ref.kind === "condition") return d.conditions[ref.i] ? conditionIssue(d.conditions[ref.i]) : null;
  if (ref.kind === "action") return d.actions[ref.i] ? actionIssue(d.actions[ref.i]) : null;
  return null;
}

const hasHebrew = (s: string) => /[֐-׿]/.test(s);

/** The first thing to fix, in plain Hebrew (null when the flow is ready to save). */
export function firstIssue(d: Draft): Issue | null {
  if (!d.name.trim()) return { message: "תן לזרימה שם" };
  const tr = nodeIssue(d, { kind: "trigger" });
  if (tr) return { message: tr, node: { kind: "trigger" } };
  for (let i = 0; i < d.conditions.length; i++) {
    const m = nodeIssue(d, { kind: "condition", i });
    if (m) return { message: m, node: { kind: "condition", i } };
  }
  if (!d.actions.length) return { message: "צריך לפחות פעולה אחת" };
  for (let i = 0; i < d.actions.length; i++) {
    const m = nodeIssue(d, { kind: "action", i });
    if (m) return { message: m, node: { kind: "action", i } };
  }
  const parsed = automationSchema.safeParse(d);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const [head, idx] = issue?.path ?? [];
    const node: NodeRef | undefined =
      head === "trigger" ? { kind: "trigger" } : head === "conditions" && typeof idx === "number" ? { kind: "condition", i: idx } : head === "actions" && typeof idx === "number" ? { kind: "action", i: idx } : head === "wait" ? { kind: "wait" } : undefined;
    return { message: issue && hasHebrew(issue.message) ? issue.message : head === "name" ? "השם ארוך מדי" : "משהו בזרימה לא שלם. בדוק את החלק המסומן.", node };
  }
  return null;
}

export const sameNode = (a: NodeRef | null | undefined, b: NodeRef | null | undefined) =>
  !!a && !!b && a.kind === b.kind && ("i" in a ? a.i : -1) === ("i" in b ? b.i : -1);

export { subjectOf };
