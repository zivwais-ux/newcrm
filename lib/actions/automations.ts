"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { canManage, requireOrg } from "@/lib/supabase/server";
import { automationSchema, conditionSchema, triggerSchema, type Automation } from "@/lib/automations/schema";
import { recipeByKey } from "@/lib/automations/recipes";
import { resolveTerms } from "@/lib/terms";
import type { ActionResult } from "@/types/domain";
import { fail, friendlyError, ok } from "./errors";

// Flows (automations), the messages they prepare, and the notifications they raise.
// The engine itself runs in Postgres; these actions only store settings and handle what it produced.

const MAX_ENABLED = 20;
const MANAGE_ONLY = "רק בעלים ומנהלים יכולים לשנות זרימות.";

export interface AutomationRow extends Automation {
  id: string;
  enabled: boolean;
  recipe_key: string | null;
  runs_count: number;
  last_run_at: string | null;
  created_at: string;
}

const COLUMNS = "id, name, enabled, trigger, conditions, wait, actions, recipe_key, runs_count, last_run_at, created_at";

export async function listAutomations(): Promise<AutomationRow[]> {
  const { supabase, org } = await requireOrg();
  const { data } = await supabase
    .from("automations")
    .select(COLUMNS)
    .eq("organization_id", org.id)
    .eq("archived", false)
    .order("created_at", { ascending: true });
  return (data ?? []) as AutomationRow[];
}

export async function getAutomation(id: string): Promise<AutomationRow | null> {
  if (!z.string().uuid().safeParse(id).success) return null;
  const { supabase, org } = await requireOrg();
  const { data } = await supabase
    .from("automations")
    .select(COLUMNS)
    .eq("organization_id", org.id)
    .eq("id", id)
    .eq("archived", false)
    .maybeSingle();
  return (data as AutomationRow | null) ?? null;
}

async function enabledCount(supabase: Awaited<ReturnType<typeof requireOrg>>["supabase"], orgId: string, except?: string) {
  let q = supabase.from("automations").select("id", { count: "exact", head: true }).eq("organization_id", orgId).eq("enabled", true).eq("archived", false);
  if (except) q = q.neq("id", except);
  const { count } = await q;
  return count ?? 0;
}

/** Creates (no id) or updates a flow. New flows start as drafts unless `enabled` is set. */
export async function saveAutomation(
  input: z.input<typeof automationSchema> & { id?: string | null; enabled?: boolean; recipe_key?: string | null },
): Promise<ActionResult<{ id: string }>> {
  const parsed = automationSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "בדוק את הזרימה.");
  const id = input.id ?? null;
  if (id && !z.string().uuid().safeParse(id).success) return fail("לא מצאנו את הזרימה.");
  const { supabase, org, role } = await requireOrg();
  if (!canManage(role)) return fail(MANAGE_ONLY);

  if (input.enabled && (await enabledCount(supabase, org.id, id ?? undefined)) >= MAX_ENABLED) {
    return fail(`אפשר עד ${MAX_ENABLED} זרימות פעילות. כבה זרימה אחרת קודם.`);
  }
  const row = {
    name: parsed.data.name,
    trigger: parsed.data.trigger,
    conditions: parsed.data.conditions,
    wait: parsed.data.wait,
    actions: parsed.data.actions,
    ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
    updated_at: new Date().toISOString(),
  };

  if (id) {
    const { data, error } = await supabase.from("automations").update(row).eq("id", id).eq("organization_id", org.id).select("id");
    if (error) return fail(friendlyError(error));
    if (!data?.length) return fail("לא מצאנו את הזרימה.");
    revalidatePath("/automations");
    return ok({ id });
  }
  const recipe = input.recipe_key && recipeByKey(input.recipe_key) ? input.recipe_key : null;
  const { data, error } = await supabase
    .from("automations")
    .insert({ ...row, organization_id: org.id, recipe_key: recipe })
    .select("id")
    .single();
  if (error) return fail(friendlyError(error));
  revalidatePath("/automations");
  return ok({ id: data.id });
}

export async function setAutomationEnabled(id: string, enabled: boolean): Promise<ActionResult<null>> {
  if (!z.string().uuid().safeParse(id).success) return fail("לא מצאנו את הזרימה.");
  const { supabase, org, role } = await requireOrg();
  if (!canManage(role)) return fail(MANAGE_ONLY);
  if (enabled && (await enabledCount(supabase, org.id, id)) >= MAX_ENABLED) {
    return fail(`אפשר עד ${MAX_ENABLED} זרימות פעילות. כבה זרימה אחרת קודם.`);
  }
  const { data, error } = await supabase
    .from("automations")
    .update({ enabled, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("organization_id", org.id)
    .select("id");
  if (error) return fail(friendlyError(error));
  if (!data?.length) return fail("לא מצאנו את הזרימה.");
  revalidatePath("/automations");
  return ok(null);
}

/** Removes a flow from the list (kept archived so its history stays readable). */
export async function archiveAutomation(id: string): Promise<ActionResult<null>> {
  if (!z.string().uuid().safeParse(id).success) return fail("לא מצאנו את הזרימה.");
  const { supabase, org, role } = await requireOrg();
  if (!canManage(role)) return fail(MANAGE_ONLY);
  const { data, error } = await supabase
    .from("automations")
    .update({ archived: true, enabled: false, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("organization_id", org.id)
    .select("id");
  if (error) return fail(friendlyError(error));
  if (!data?.length) return fail("לא מצאנו את הזרימה.");
  revalidatePath("/automations");
  return ok(null);
}

/** One tap: turns a ready-made recipe into a working flow, in the business's own words. */
export async function enableRecipe(key: string, opts: { dateField?: string } = {}): Promise<ActionResult<{ id: string }>> {
  const recipe = recipeByKey(key);
  if (!recipe) return fail("המתכון לא נמצא.");
  const { org } = await requireOrg();
  const flow = recipe.build(resolveTerms(org.terms));
  if (flow.trigger.type === "days_from_date" && flow.trigger.anchor === "custom_date") {
    if (!opts.dateField) return fail("בחר שדה תאריך.");
    flow.trigger = { ...flow.trigger, field: opts.dateField };
  }
  return saveAutomation({ ...flow, enabled: true, recipe_key: key });
}

const previewSchema = z.object({ trigger: triggerSchema, conditions: z.array(conditionSchema).max(8).default([]) });

export interface PreviewResult {
  /** "today" for date/inactivity flows, "30d" for event flows. */
  window: "today" | "30d";
  total: number;
  names: string[];
}

/** Dry run: who the flow would run on. Nothing is written. */
export async function previewAutomation(input: z.input<typeof previewSchema>): Promise<ActionResult<PreviewResult>> {
  const parsed = previewSchema.safeParse(input);
  if (!parsed.success) return fail("השלם את הזרימה כדי לנסות אותה.");
  const { supabase, org } = await requireOrg();
  const { data, error } = await supabase.rpc("automation_preview", {
    p_org: org.id,
    p_trigger: parsed.data.trigger,
    p_conditions: parsed.data.conditions,
  });
  if (error) return fail(friendlyError(error));
  const r = data as { window?: string; total?: number; names?: string[] } | null;
  return ok({ window: r?.window === "today" ? "today" : "30d", total: Number(r?.total ?? 0), names: r?.names ?? [] });
}

export interface RunRow {
  id: string;
  automation_id: string;
  automation_name: string;
  status: "done" | "skipped" | "failed";
  summary: string | null;
  created_at: string;
}

/** Recent runs (all flows, or one). */
export async function listRuns(automationId?: string): Promise<RunRow[]> {
  const { supabase, org } = await requireOrg();
  let q = supabase
    .from("automation_runs")
    .select("id, automation_id, status, summary, created_at")
    .eq("organization_id", org.id)
    .order("created_at", { ascending: false })
    .limit(50);
  if (automationId && z.string().uuid().safeParse(automationId).success) q = q.eq("automation_id", automationId);
  const [{ data: runs }, { data: flows }] = await Promise.all([
    q,
    supabase.from("automations").select("id, name").eq("organization_id", org.id),
  ]);
  const names = new Map((flows ?? []).map((f) => [f.id as string, f.name as string]));
  return (runs ?? []).map((r) => ({ ...r, automation_name: names.get(r.automation_id) ?? "זרימה" })) as RunRow[];
}

// ---------------------------------------------------------------------------
// Messages waiting to be sent (prepared by flows, sent by a person in one tap)

export interface OutboxRow {
  id: string;
  customer_id: string | null;
  lead_id: string | null;
  name: string | null;
  phone: string;
  body: string;
  automation_id: string | null;
  created_at: string;
}

export async function listOutbox(limit = 30): Promise<OutboxRow[]> {
  const { supabase, org } = await requireOrg();
  const { data } = await supabase
    .from("outbox_messages")
    .select("id, customer_id, lead_id, name, phone, body, automation_id, created_at")
    .eq("organization_id", org.id)
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(Math.min(Math.max(limit, 1), 100));
  return (data ?? []) as OutboxRow[];
}

/** Marks a prepared message as sent (the browser opened WhatsApp) and logs it on the customer. */
export async function markOutboxSent(id: string): Promise<ActionResult<null>> {
  if (!z.string().uuid().safeParse(id).success) return fail("ההודעה לא נמצאה.");
  const { supabase, org, user } = await requireOrg();
  const { data, error } = await supabase
    .from("outbox_messages")
    .update({ status: "sent", handled_at: new Date().toISOString() })
    .eq("id", id)
    .eq("organization_id", org.id)
    .eq("status", "pending")
    .select("customer_id, body")
    .maybeSingle();
  if (error) return fail(friendlyError(error));
  if (!data) return ok(null); // already handled (another tab or teammate)
  if (data.customer_id) {
    await supabase.from("activities").insert({
      organization_id: org.id,
      customer_id: data.customer_id,
      owner_id: user.id,
      type: "whatsapp",
      date: new Date().toISOString(),
      notes: `זרימה: ${data.body}`.slice(0, 2000),
    });
  }
  revalidatePath("/", "layout");
  return ok(null);
}

export async function dismissOutbox(id: string): Promise<ActionResult<null>> {
  if (!z.string().uuid().safeParse(id).success) return fail("ההודעה לא נמצאה.");
  const { supabase, org } = await requireOrg();
  const { error } = await supabase
    .from("outbox_messages")
    .update({ status: "dismissed", handled_at: new Date().toISOString() })
    .eq("id", id)
    .eq("organization_id", org.id)
    .eq("status", "pending");
  if (error) return fail(friendlyError(error));
  revalidatePath("/", "layout");
  return ok(null);
}

// ---------------------------------------------------------------------------
// Notifications (bell)

export interface NotificationRow {
  id: string;
  title: string;
  body: string | null;
  link: string | null;
  read_at: string | null;
  created_at: string;
}

export async function listNotifications(): Promise<NotificationRow[]> {
  const { supabase, org } = await requireOrg();
  const { data } = await supabase
    .from("notifications")
    .select("id, title, body, link, read_at, created_at")
    .eq("organization_id", org.id)
    .order("created_at", { ascending: false })
    .limit(30);
  return (data ?? []) as NotificationRow[];
}

/** Marks the given notifications (or all unread) as read. */
export async function markNotificationsRead(ids?: string[]): Promise<ActionResult<null>> {
  const valid = (ids ?? []).filter((i) => z.string().uuid().safeParse(i).success).slice(0, 100);
  const { supabase, org } = await requireOrg();
  let q = supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("organization_id", org.id).is("read_at", null);
  if (ids) {
    if (!valid.length) return ok(null);
    q = q.in("id", valid);
  }
  const { error } = await q;
  if (error) return fail(friendlyError(error));
  return ok(null);
}
