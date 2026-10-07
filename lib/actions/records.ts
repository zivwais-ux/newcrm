"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { canManage, requireOrg } from "@/lib/supabase/server";
import { ACTIVITY_TYPES, type ActionResult } from "@/types/domain";
import { canStoreValues, mergeCustomFields, type FieldDef } from "@/lib/fields";
import { fail, friendlyError, ok } from "./errors";

// Manual data entry and editing for every canonical entity.
// All writes go through the user-scoped client, so RLS enforces tenancy.

/** Deal stages are the business's own; the DB trigger checks the key exists for the organization. */
const stageKey = z.string().regex(/^[a-z0-9_]{1,40}$/, "השלב לא תקין.");

/** A stage the DB rejected (23514) was removed or renamed away in the meantime. */
function dealError(error: { code?: string; message?: string }) {
  return error.code === "23514" ? "השלב הזה כבר לא קיים. רענן את העמוד ובחר שלב אחר." : friendlyError(error);
}

const optionalText = (max = 200) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .nullable()
    .transform((v) => (v ? v : null));
const optionalUuid = z
  .string()
  .optional()
  .nullable()
  .transform((v) => (v ? v : null))
  .pipe(z.string().uuid().nullable());
const optionalDate = z
  .string()
  .optional()
  .nullable()
  .transform((v) => (v ? v : null))
  .pipe(z.string().regex(/^\d{4}-\d{2}-\d{2}/, "תאריך לא תקין").nullable());
const money = z.coerce.number({ message: "הכנס סכום" }).finite().min(0, "הסכום לא יכול להיות שלילי").max(1e10);

const schemas = {
  customers: z.object({
    name: z.string().trim().min(1, "צריך למלא שם").max(200),
    email: optionalText().pipe(z.string().email("כתובת האימייל לא תקינה").nullable()),
    phone: optionalText(40),
    company: optionalText(),
    status: z.enum(["active", "inactive", "lead", "churned"]).default("active"),
  }),
  leads: z.object({
    name: z.string().trim().min(1, "צריך למלא שם").max(200),
    email: optionalText().pipe(z.string().email("כתובת האימייל לא תקינה").nullable()),
    phone: optionalText(40),
    source: optionalText(80),
    status: z.enum(["new", "contacted", "qualified", "converted", "lost"]).default("new"),
    value: z.coerce.number().min(0).max(1e10).optional().nullable(),
    owner_id: optionalUuid,
  }),
  deals: z.object({
    name: z.string().trim().min(1, "צריך למלא שם לעסקה").max(200),
    customer_id: optionalUuid,
    stage: stageKey.default("new"),
    value: money.default(0),
    owner_id: optionalUuid,
    expected_close: optionalDate,
  }),
  transactions: z.object({
    customer_id: optionalUuid,
    amount: money,
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "בחר תאריך"),
    product_or_service: optionalText(),
    status: z.enum(["paid", "pending", "cancelled", "refunded"]).default("paid"),
    type: z.enum(["sale", "refund", "subscription", "other"]).default("sale"),
  }),
  activities: z.object({
    customer_id: optionalUuid,
    deal_id: optionalUuid,
    type: z.enum(ACTIVITY_TYPES).default("appointment"),
    date: z.string().min(10, "בחר תאריך"),
    notes: optionalText(2000),
  }),
  tasks: z.object({
    title: z.string().trim().min(1, "צריך לכתוב מה המשימה").max(200),
    description: optionalText(2000),
    customer_id: optionalUuid,
    deal_id: optionalUuid,
    assigned_to: optionalUuid,
    due_date: optionalDate,
  }),
} as const;

export type RecordEntity = keyof typeof schemas;
export type RecordInput<E extends RecordEntity> = z.input<(typeof schemas)[E]> & {
  /** Values of the business's own fields, by field key. Merged into the record's custom_fields. */
  custom_fields?: Record<string, unknown>;
};

const PATHS: Record<RecordEntity, string[]> = {
  customers: ["/customers", "/home"],
  leads: ["/leads", "/home"],
  deals: ["/deals", "/home"],
  transactions: ["/transactions", "/home"],
  activities: ["/activities", "/home"],
  tasks: ["/tasks", "/home"],
};

type Supabase = Awaited<ReturnType<typeof requireOrg>>["supabase"];

/** Splits the business's own field values off the built-in columns. */
function splitCustom(input: unknown): { rest: unknown; custom: Record<string, unknown> | null } {
  if (!input || typeof input !== "object") return { rest: input, custom: null };
  const { custom_fields, ...rest } = input as Record<string, unknown>;
  const custom = custom_fields && typeof custom_fields === "object" && !Array.isArray(custom_fields) ? (custom_fields as Record<string, unknown>) : null;
  return { rest, custom };
}

async function loadEntityFields(supabase: Supabase, orgId: string, entity: RecordEntity): Promise<FieldDef[] | null> {
  const { data, error } = await supabase
    .from("field_definitions")
    .select("id, entity, key, label, type, options, position, show_in_list")
    .eq("organization_id", orgId)
    .eq("entity", entity)
    .eq("archived", false);
  if (error) return null;
  return (data ?? []) as FieldDef[];
}

/**
 * The record's custom_fields after applying the form's values for the business's own fields.
 * Returns undefined when there's nothing to write (no values sent, no fields, or no column).
 */
async function resolveCustomFields(
  supabase: Supabase,
  orgId: string,
  entity: RecordEntity,
  custom: Record<string, unknown> | null,
  recordId?: string,
): Promise<{ ok: true; value: Record<string, unknown> | undefined } | { ok: false; error: string }> {
  if (!custom || !canStoreValues(entity)) return { ok: true, value: undefined };
  const defs = await loadEntityFields(supabase, orgId, entity);
  if (defs === null) return { ok: false, error: "לא הצלחנו לטעון את השדות. נסה שוב." };
  const touched = defs.filter((d) => d.key in custom);
  if (!touched.length) return { ok: true, value: undefined };
  let existing: Record<string, unknown> = {};
  if (recordId) {
    const { data, error } = await supabase.from(entity).select("custom_fields").eq("id", recordId).eq("organization_id", orgId).maybeSingle();
    if (error) return { ok: false, error: friendlyError(error) };
    if (!data) return { ok: false, error: "לא מצאנו את הרשומה. ייתכן שהיא נמחקה — רענן את העמוד." };
    existing = ((data as { custom_fields?: Record<string, unknown> | null }).custom_fields ?? {}) as Record<string, unknown>;
  }
  return mergeCustomFields(touched, existing, custom);
}

/** Marks a deal as just worked on. last_activity_at is timestamptz, so "now" is the same instant in Israel. */
async function touchDeal(supabase: Supabase, orgId: string, dealId: string) {
  const { error } = await supabase
    .from("deals")
    .update({ last_activity_at: new Date().toISOString() })
    .eq("id", dealId)
    .eq("organization_id", orgId);
  // The main write already succeeded; a stale "last activity" is not worth failing it.
  if (error) console.error("[touchDeal]", error.code, error.message);
}

// RLS: members may delete only activities and tasks; everything else needs owner/admin.
const MEMBER_DELETABLE: RecordEntity[] = ["activities", "tasks"];

function revalidate(entity: RecordEntity, customerId?: string | null) {
  for (const p of PATHS[entity]) revalidatePath(p);
  if (customerId) revalidatePath(`/customers/${customerId}`);
}

export async function createRecord<E extends RecordEntity>(entity: E, input: RecordInput<E>): Promise<ActionResult<{ id: string }>> {
  const { rest, custom } = splitCustom(input);
  const parsed = schemas[entity].safeParse(rest);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "בדוק את הפרטים בטופס.");
  const { supabase, org, user } = await requireOrg();
  const values: Record<string, unknown> = { ...parsed.data, organization_id: org.id };
  const customFields = await resolveCustomFields(supabase, org.id, entity, custom);
  if (!customFields.ok) return fail(customFields.error);
  if (customFields.value) values.custom_fields = customFields.value;
  if (entity === "customers" || entity === "transactions" || entity === "activities") values.owner_id = user.id;
  if (entity === "deals" || entity === "leads") values.owner_id ??= user.id;
  if (entity === "tasks") values.assigned_to ??= user.id;
  if (entity === "transactions" && values.type === "refund") values.status = "refunded";

  const { data, error } = await supabase.from(entity).insert(values).select("id").single();
  if (error) return fail(entity === "deals" ? dealError(error) : friendlyError(error));

  if (entity === "activities" && values.deal_id) {
    await touchDeal(supabase, org.id, values.deal_id as string);
  }
  revalidate(entity, values.customer_id as string | null);
  return ok({ id: data.id });
}

export async function updateRecord<E extends RecordEntity>(
  entity: E,
  id: string,
  input: RecordInput<E>,
): Promise<ActionResult<null>> {
  if (!z.string().uuid().safeParse(id).success) return fail("הרשומה לא תקינה.");
  const { rest, custom } = splitCustom(input);
  const parsed = schemas[entity].safeParse(rest);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "בדוק את הפרטים בטופס.");
  const { supabase, org } = await requireOrg();
  const values: Record<string, unknown> = { ...parsed.data };
  // Merged with what the record already stores, so imported/legacy keys survive the edit.
  const customFields = await resolveCustomFields(supabase, org.id, entity, custom, id);
  if (!customFields.ok) return fail(customFields.error);
  if (customFields.value) values.custom_fields = customFields.value;
  if (entity === "deals") values.last_activity_at = new Date().toISOString();
  if (entity === "transactions" && values.type === "refund") values.status = "refunded";
  const { data, error } = await supabase
    .from(entity)
    .update(values)
    .eq("id", id)
    .eq("organization_id", org.id)
    .select("id");
  if (error) return fail(entity === "deals" ? dealError(error) : friendlyError(error));
  if (!data?.length) return fail("לא מצאנו את הרשומה. ייתכן שהיא נמחקה — רענן את העמוד.");
  revalidate(entity, values.customer_id as string | null);
  if (entity === "customers") revalidatePath(`/customers/${id}`);
  return ok(null);
}

export async function deleteRecord(entity: RecordEntity, id: string): Promise<ActionResult<null>> {
  if (!z.string().uuid().safeParse(id).success) return fail("הרשומה לא תקינה.");
  const { supabase, org, role } = await requireOrg();
  if (!MEMBER_DELETABLE.includes(entity) && !canManage(role)) return fail("רק בעלים ומנהלים יכולים למחוק את הרשומה הזו.");
  const { data, error } = await supabase.from(entity).delete().eq("id", id).eq("organization_id", org.id).select("id");
  if (error) return fail(friendlyError(error));
  if (!data?.length) return fail("לא מצאנו את הרשומה. ייתכן שהיא כבר נמחקה — רענן את העמוד.");
  revalidate(entity);
  return ok(null);
}

export async function moveDeal(id: string, stage: string): Promise<ActionResult<null>> {
  const parsed = z.object({ id: z.string().uuid(), stage: stageKey }).safeParse({ id, stage });
  if (!parsed.success) return fail("השלב לא תקין.");
  const { supabase, org } = await requireOrg();
  const { data, error } = await supabase
    .from("deals")
    .update({ stage: parsed.data.stage, last_activity_at: new Date().toISOString() })
    .eq("id", id)
    .eq("organization_id", org.id)
    .select("id");
  if (error) return fail(dealError(error));
  if (!data?.length) return fail("לא מצאנו את העסקה. ייתכן שהיא נמחקה — רענן את העמוד.");
  revalidatePath("/deals");
  revalidatePath("/home");
  return ok(null);
}

export async function setTaskStatus(id: string, status: "open" | "done"): Promise<ActionResult<null>> {
  const parsed = z.object({ id: z.string().uuid(), status: z.enum(["open", "done"]) }).safeParse({ id, status });
  if (!parsed.success) return fail("המשימה לא תקינה.");
  const { supabase, org } = await requireOrg();
  const { data, error } = await supabase
    .from("tasks")
    .update({ status: parsed.data.status })
    .eq("id", id)
    .eq("organization_id", org.id)
    .select("id, deal_id, customer_id");
  if (error) return fail(friendlyError(error));
  const task = data?.[0];
  if (!task) return fail("לא מצאנו את המשימה. ייתכן שהיא נמחקה — רענן את העמוד.");
  // Completing a task is work on its deal: keep the deal off the "stuck deals" list.
  if (parsed.data.status === "done" && task.deal_id) {
    await touchDeal(supabase, org.id, task.deal_id);
    revalidatePath("/deals");
  }
  revalidatePath("/tasks");
  revalidatePath("/home");
  if (task.customer_id) revalidatePath(`/customers/${task.customer_id}`);
  return ok(null);
}

const followupSchema = z.object({
  customerIds: z.array(z.string().uuid()).max(500).default([]),
  dealIds: z.array(z.string().uuid()).max(500).default([]),
  title: z.string().trim().min(1).max(200),
  dueDate: optionalDate,
  assignedTo: optionalUuid,
  note: optionalText(500),
});

/**
 * Creates one follow-up task per selected customer/deal. Only ever called after
 * the user confirms in the UI — the AI never invokes writes on its own.
 */
export async function createFollowupTasks(input: z.input<typeof followupSchema>): Promise<ActionResult<{ created: number }>> {
  const parsed = followupSchema.safeParse(input);
  if (!parsed.success) return fail("בדוק את פרטי המשימה.");
  const { customerIds, dealIds, title, dueDate, assignedTo, note } = parsed.data;
  if (!customerIds.length && !dealIds.length) return fail("בחר לפחות רשומה אחת.");
  const { supabase, org, user } = await requireOrg();

  // Fetch in chunks so long selections never produce oversized request URLs.
  async function fetchIn<T>(table: "customers" | "deals", columns: string, ids: string[]) {
    const out: T[] = [];
    for (let i = 0; i < ids.length; i += 100) {
      const { data, error } = await supabase.from(table).select(columns).eq("organization_id", org.id).in("id", ids.slice(i, i + 100));
      if (error) throw error;
      out.push(...((data ?? []) as T[]));
    }
    return out;
  }
  let customers: { id: string; name: string }[];
  let deals: { id: string; name: string; customer_id: string | null }[];
  try {
    [customers, deals] = await Promise.all([
      fetchIn<{ id: string; name: string }>("customers", "id, name", customerIds),
      fetchIn<{ id: string; name: string; customer_id: string | null }>("deals", "id, name, customer_id", dealIds),
    ]);
  } catch (error) {
    return fail(friendlyError(error as Error));
  }

  const base = { organization_id: org.id, assigned_to: assignedTo ?? user.id, due_date: dueDate, status: "open", description: note };
  const rows = [
    ...customers.map((c) => ({ ...base, title: `${title} — ${c.name}`, customer_id: c.id })),
    ...deals.map((d) => ({ ...base, title: `${title} — ${d.name}`, deal_id: d.id, customer_id: d.customer_id })),
  ];
  if (!rows.length) return fail("לא מצאנו את הרשומות שבחרת.");
  const { error } = await supabase.from("tasks").insert(rows);
  if (error) return fail(friendlyError(error));
  revalidatePath("/tasks");
  revalidatePath("/home");
  revalidatePath("/customers");
  for (const c of customers) revalidatePath(`/customers/${c.id}`);
  return ok({ created: rows.length });
}
