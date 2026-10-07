import { z } from "zod";

// One automation = WHEN (trigger) → IF (conditions, all must hold) → WAIT → DO (actions).
// The same JSON is stored in Postgres and executed there (supabase/migrations/*_automations.sql),
// so every value here is whitelisted and bounded — never free SQL.

export const SUBJECTS = ["customers", "transactions", "activities", "leads", "deals", "tasks"] as const;
export type Subject = (typeof SUBJECTS)[number];

const days = z.number().int().min(0).max(365);
const fieldKey = z.string().regex(/^f_[a-z0-9_]{1,40}$/);
const stageKey = z.string().regex(/^[a-z0-9_]{1,40}$/);

export const triggerSchema = z.discriminatedUnion("type", [
  /** A record of this kind was added (by hand, import or quick entry). */
  z.object({ type: z.literal("record_created"), entity: z.enum(SUBJECTS) }),
  /** A deal moved to this stage. */
  z.object({ type: z.literal("deal_stage"), stage: stageKey }),
  /** A lead or a sale changed status. */
  z.object({
    type: z.literal("status_changed"),
    entity: z.enum(["leads", "transactions"]),
    status: z.string().regex(/^[a-z_]{1,20}$/),
  }),
  /**
   * N days after (or before, with `before`) a date on a customer:
   * their last purchase, their next appointment, or one of the business's own date fields.
   */
  z.object({
    type: z.literal("days_from_date"),
    anchor: z.enum(["last_purchase", "appointment", "custom_date"]),
    field: fieldKey.optional(),
    days,
    before: z.boolean().default(false),
  }),
  /** A customer or an open deal had no activity for N days. */
  z.object({ type: z.literal("no_activity"), entity: z.enum(["customers", "deals"]), days: days.min(1) }),
]);
export type Trigger = z.infer<typeof triggerSchema>;

/** What a condition can look at, per subject. "cf:<key>" = a field the business defined. */
export const CONDITION_FIELDS: Record<Subject, readonly string[]> = {
  customers: ["status", "has_phone", "purchases", "total_revenue", "days_since_purchase"],
  transactions: ["amount", "service", "status", "is_first_purchase", "has_phone", "purchases"],
  activities: ["type", "has_phone", "purchases"],
  leads: ["status", "source", "has_phone"],
  deals: ["stage", "value", "has_phone"],
  tasks: ["status"],
};

export const OPERATORS = ["eq", "neq", "gt", "lt", "contains", "empty", "not_empty"] as const;
export type Operator = (typeof OPERATORS)[number];

export const conditionSchema = z.object({
  field: z.string().regex(/^(cf:f_[a-z0-9_]{1,40}|[a-z_]{1,30})$/),
  op: z.enum(OPERATORS),
  value: z.string().max(100).default(""),
});
export type Condition = z.infer<typeof conditionSchema>;

/** Message/task text may use these placeholders; the engine fills them from the record. */
export const PLACEHOLDERS = ["{שם}", "{שירות}", "{סכום}", "{תאריך}", "{שעה}", "{עסק}"] as const;

export const actionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("create_task"), title: z.string().trim().min(1).max(200), due_in_days: days.default(0) }),
  /** Prepares a WhatsApp message; it waits in "messages to send" for one tap. Never sent automatically. */
  z.object({ type: z.literal("prepare_whatsapp"), body: z.string().trim().min(1).max(1000) }),
  z.object({ type: z.literal("add_note"), text: z.string().trim().min(1).max(1000) }),
  z.object({ type: z.literal("notify"), title: z.string().trim().min(1).max(200) }),
  /** Changes one value on the record (or its customer): status, stage, or a field of the business's own. */
  z.object({
    type: z.literal("set_value"),
    target: z.enum(["customer_status", "lead_status", "deal_stage", "custom_field"]),
    field: fieldKey.optional(),
    value: z.string().max(100),
  }),
]);
export type Action = z.infer<typeof actionSchema>;

export const automationSchema = z
  .object({
    name: z.string().trim().min(1, "תן לזרימה שם").max(80),
    trigger: triggerSchema,
    conditions: z.array(conditionSchema).max(8).default([]),
    wait: z.object({ days: days.default(0), hours: z.number().int().min(0).max(23).default(0) }).default({ days: 0, hours: 0 }),
    actions: z.array(actionSchema).min(1, "צריך לפחות פעולה אחת").max(6),
  })
  .superRefine((a, ctx) => {
    const subject = subjectOf(a.trigger);
    for (const c of a.conditions) {
      if (!c.field.startsWith("cf:") && !CONDITION_FIELDS[subject].includes(c.field)) {
        ctx.addIssue({ code: "custom", message: "התנאי לא מתאים לסוג הזרימה" });
      }
    }
    if (a.trigger.type === "days_from_date" && a.trigger.anchor === "custom_date" && !a.trigger.field) {
      ctx.addIssue({ code: "custom", message: "בחר שדה תאריך" });
    }
    for (const act of a.actions) {
      if (act.type === "set_value" && act.target === "custom_field" && !act.field) ctx.addIssue({ code: "custom", message: "בחר שדה לעדכון" });
    }
  });
export type Automation = z.infer<typeof automationSchema>;

/** The record an automation runs on. Date/inactivity triggers run on customers (or deals). */
export function subjectOf(t: Trigger): Subject {
  switch (t.type) {
    case "record_created":
      return t.entity;
    case "deal_stage":
      return "deals";
    case "status_changed":
      return t.entity;
    case "days_from_date":
      return "customers";
    case "no_activity":
      return t.entity;
  }
}
