"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireOrg } from "@/lib/supabase/server";
import { ACTIVITY_TYPES, DEAL_STAGES, type ActionResult } from "@/types/domain";
import { fail, friendlyError, ok } from "./errors";

// Manual data entry and editing for every canonical entity.
// All writes go through the user-scoped client, so RLS enforces tenancy.

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
  .pipe(z.string().regex(/^\d{4}-\d{2}-\d{2}/, "Invalid date").nullable());
const money = z.coerce.number({ message: "Enter an amount" }).finite().min(0, "Amount can't be negative").max(1e10);

const schemas = {
  customers: z.object({
    name: z.string().trim().min(1, "Name is required").max(200),
    email: optionalText().pipe(z.string().email("Invalid email").nullable()),
    phone: optionalText(40),
    company: optionalText(),
    status: z.enum(["active", "inactive", "lead", "churned"]).default("active"),
  }),
  leads: z.object({
    name: z.string().trim().min(1, "Name is required").max(200),
    email: optionalText().pipe(z.string().email("Invalid email").nullable()),
    phone: optionalText(40),
    source: optionalText(80),
    status: z.enum(["new", "contacted", "qualified", "converted", "lost"]).default("new"),
    value: z.coerce.number().min(0).max(1e10).optional().nullable(),
    owner_id: optionalUuid,
  }),
  deals: z.object({
    name: z.string().trim().min(1, "Deal name is required").max(200),
    customer_id: optionalUuid,
    stage: z.enum(DEAL_STAGES).default("new"),
    value: money.default(0),
    owner_id: optionalUuid,
    expected_close: optionalDate,
  }),
  transactions: z.object({
    customer_id: optionalUuid,
    amount: money,
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a date"),
    product_or_service: optionalText(),
    status: z.enum(["paid", "pending", "cancelled", "refunded"]).default("paid"),
    type: z.enum(["sale", "refund", "subscription", "other"]).default("sale"),
  }),
  activities: z.object({
    customer_id: optionalUuid,
    deal_id: optionalUuid,
    type: z.enum(ACTIVITY_TYPES).default("appointment"),
    date: z.string().min(10, "Choose a date"),
    notes: optionalText(2000),
  }),
  tasks: z.object({
    title: z.string().trim().min(1, "Title is required").max(200),
    description: optionalText(2000),
    customer_id: optionalUuid,
    deal_id: optionalUuid,
    assigned_to: optionalUuid,
    due_date: optionalDate,
  }),
} as const;

export type RecordEntity = keyof typeof schemas;
export type RecordInput<E extends RecordEntity> = z.input<(typeof schemas)[E]>;

const PATHS: Record<RecordEntity, string[]> = {
  customers: ["/customers", "/home"],
  leads: ["/leads", "/home"],
  deals: ["/deals", "/home"],
  transactions: ["/transactions", "/home"],
  activities: ["/activities", "/home"],
  tasks: ["/tasks", "/home"],
};

function revalidate(entity: RecordEntity, customerId?: string | null) {
  for (const p of PATHS[entity]) revalidatePath(p);
  if (customerId) revalidatePath(`/customers/${customerId}`);
}

export async function createRecord<E extends RecordEntity>(entity: E, input: RecordInput<E>): Promise<ActionResult<{ id: string }>> {
  const parsed = schemas[entity].safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Please check the form.");
  const { supabase, org, user } = await requireOrg();
  const values: Record<string, unknown> = { ...parsed.data, organization_id: org.id };
  if (entity === "customers" || entity === "transactions" || entity === "activities") values.owner_id = user.id;
  if (entity === "deals" || entity === "leads") values.owner_id ??= user.id;
  if (entity === "tasks") values.assigned_to ??= user.id;
  if (entity === "transactions" && values.type === "refund") values.status = "refunded";

  const { data, error } = await supabase.from(entity).insert(values).select("id").single();
  if (error) return fail(friendlyError(error));

  if (entity === "activities" && values.deal_id) {
    await supabase.from("deals").update({ last_activity_at: new Date().toISOString() }).eq("id", values.deal_id as string);
  }
  revalidate(entity, values.customer_id as string | null);
  return ok({ id: data.id });
}

export async function updateRecord<E extends RecordEntity>(
  entity: E,
  id: string,
  input: RecordInput<E>,
): Promise<ActionResult<null>> {
  if (!z.string().uuid().safeParse(id).success) return fail("Invalid record.");
  const parsed = schemas[entity].safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Please check the form.");
  const { supabase, org } = await requireOrg();
  const values: Record<string, unknown> = { ...parsed.data };
  if (entity === "deals") values.last_activity_at = new Date().toISOString();
  const { error, count } = await supabase
    .from(entity)
    .update(values, { count: "exact" })
    .eq("id", id)
    .eq("organization_id", org.id);
  if (error) return fail(friendlyError(error));
  if (!count) return fail("We couldn't find that record.");
  revalidate(entity, values.customer_id as string | null);
  if (entity === "customers") revalidatePath(`/customers/${id}`);
  return ok(null);
}

export async function deleteRecord(entity: RecordEntity, id: string): Promise<ActionResult<null>> {
  if (!z.string().uuid().safeParse(id).success) return fail("Invalid record.");
  const { supabase, org } = await requireOrg();
  const { error, count } = await supabase.from(entity).delete({ count: "exact" }).eq("id", id).eq("organization_id", org.id);
  if (error) return fail(friendlyError(error));
  if (!count) return fail("You don't have permission to delete this record.");
  revalidate(entity);
  return ok(null);
}

export async function moveDeal(id: string, stage: string): Promise<ActionResult<null>> {
  const parsed = z.object({ id: z.string().uuid(), stage: z.enum(DEAL_STAGES) }).safeParse({ id, stage });
  if (!parsed.success) return fail("Invalid stage.");
  const { supabase, org } = await requireOrg();
  const { error } = await supabase
    .from("deals")
    .update({ stage: parsed.data.stage, last_activity_at: new Date().toISOString() })
    .eq("id", id)
    .eq("organization_id", org.id);
  if (error) return fail(friendlyError(error));
  revalidatePath("/deals");
  revalidatePath("/home");
  return ok(null);
}

export async function setTaskStatus(id: string, status: "open" | "done"): Promise<ActionResult<null>> {
  const parsed = z.object({ id: z.string().uuid(), status: z.enum(["open", "done"]) }).safeParse({ id, status });
  if (!parsed.success) return fail("Invalid task.");
  const { supabase, org } = await requireOrg();
  const { error } = await supabase.from("tasks").update({ status }).eq("id", id).eq("organization_id", org.id);
  if (error) return fail(friendlyError(error));
  revalidatePath("/tasks");
  revalidatePath("/home");
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
  if (!parsed.success) return fail("Please check the task details.");
  const { customerIds, dealIds, title, dueDate, assignedTo, note } = parsed.data;
  if (!customerIds.length && !dealIds.length) return fail("Select at least one record.");
  const { supabase, org, user } = await requireOrg();

  const [customers, deals] = await Promise.all([
    customerIds.length
      ? supabase.from("customers").select("id, name").eq("organization_id", org.id).in("id", customerIds)
      : Promise.resolve({ data: [] as { id: string; name: string }[], error: null }),
    dealIds.length
      ? supabase.from("deals").select("id, name, customer_id").eq("organization_id", org.id).in("id", dealIds)
      : Promise.resolve({ data: [] as { id: string; name: string; customer_id: string | null }[], error: null }),
  ]);
  if (customers.error || deals.error) return fail(friendlyError(customers.error ?? deals.error));

  const base = { organization_id: org.id, assigned_to: assignedTo ?? user.id, due_date: dueDate, status: "open", description: note };
  const rows = [
    ...(customers.data ?? []).map((c) => ({ ...base, title: `${title} — ${c.name}`, customer_id: c.id })),
    ...(deals.data ?? []).map((d) => ({ ...base, title: `${title} — ${d.name}`, deal_id: d.id, customer_id: d.customer_id })),
  ];
  if (!rows.length) return fail("We couldn't find the selected records.");
  const { error } = await supabase.from("tasks").insert(rows);
  if (error) return fail(friendlyError(error));
  revalidatePath("/tasks");
  revalidatePath("/home");
  revalidatePath("/customers");
  for (const c of customers.data ?? []) revalidatePath(`/customers/${c.id}`);
  return ok({ created: rows.length });
}
