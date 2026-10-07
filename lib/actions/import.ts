"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { canManage, requireOrg } from "@/lib/supabase/server";
import { buildBundle, CustomerResolver, type CanonicalRecord } from "@/lib/data-mapping/transform";
import { getDataCounts } from "@/lib/analytics/queries";
import { COMPONENT_REGISTRY, getDefinition, missingEntities } from "@/lib/components/registry";
import { DEAL_STAGES, type ActionResult } from "@/types/domain";
import { loadStages } from "@/lib/stages";
import { fail, friendlyError, ok } from "./errors";

const BATCH = 500;
const MAX_SHEET_BYTES = 10 * 1024 * 1024;

const GOOGLE_HOSTS = /(^|\.)(google\.com|googleusercontent\.com)$/;

/**
 * Downloads a Google Sheet shared as "anyone with the link" as .xlsx (all tabs).
 * Only Google hosts are contacted, redirects are followed manually and re-checked.
 */
export async function fetchGoogleSheet(link: string): Promise<ActionResult<{ base64: string; title: string }>> {
  await requireOrg();
  const match = String(link ?? "").match(/^https:\/\/docs\.google\.com\/spreadsheets\/d\/([a-zA-Z0-9_-]{20,80})/);
  if (!match) return fail("הקישור לא נראה כמו קישור ל־Google Sheets. העתק את הקישור משורת הכתובת של הגיליון.");
  let url = `https://docs.google.com/spreadsheets/d/${match[1]}/export?format=xlsx`;
  try {
    for (let hop = 0; hop < 4; hop++) {
      const res = await fetch(url, { redirect: "manual", cache: "no-store", signal: AbortSignal.timeout(20_000) });
      if (res.status >= 300 && res.status < 400) {
        const next = new URL(res.headers.get("location") ?? "", url);
        if (next.protocol !== "https:" || !GOOGLE_HOSTS.test(next.hostname)) return fail("לא הצלחנו להוריד את הגיליון.");
        if (/accounts\.google\.com/.test(next.hostname)) break;
        url = next.toString();
        continue;
      }
      const type = res.headers.get("content-type") ?? "";
      if (!res.ok || type.includes("text/html")) break;
      const length = Number(res.headers.get("content-length") ?? 0);
      if (length > MAX_SHEET_BYTES) return fail("הגיליון גדול מ־10MB. נסה לייצא חלק ממנו.");
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.byteLength > MAX_SHEET_BYTES) return fail("הגיליון גדול מ־10MB. נסה לייצא חלק ממנו.");
      const disposition = res.headers.get("content-disposition") ?? "";
      const name = decodeURIComponent(disposition.match(/filename\*=UTF-8''([^;]+)/)?.[1] ?? "").replace(/\.xlsx$/i, "");
      return ok({ base64: buf.toString("base64"), title: name || "Google Sheets" });
    }
    return fail("הגיליון לא משותף. ב־Google Sheets לחץ “שיתוף” ← “כל מי שיש לו את הקישור” ונסה שוב.");
  } catch {
    return fail("לא הצלחנו להוריד את הגיליון. בדוק את הקישור ונסה שוב.");
  }
}

const mappingSchema = z
  .array(
    z.object({
      column: z.string().max(200),
      target: z.string().max(60),
      confidence: z.number().min(0).max(1),
      reason: z.string().max(300).optional(),
      source: z.enum(["ai", "heuristic", "user"]),
    }),
  )
  .max(200);

const createImportSchema = z.object({
  fileName: z.string().trim().min(1).max(255),
  fileType: z.enum(["csv", "excel"]),
  storagePath: z.string().max(500).nullable(),
  rowCount: z.number().int().min(0).max(200_000),
  mapping: mappingSchema,
});

export async function createImport(input: z.infer<typeof createImportSchema>): Promise<ActionResult<{ id: string }>> {
  const parsed = createImportSchema.safeParse(input);
  if (!parsed.success) return fail("אי אפשר לייבא את הקובץ הזה.");
  const { supabase, org } = await requireOrg();
  if (parsed.data.storagePath && !parsed.data.storagePath.startsWith(`${org.id}/`)) return fail("מיקום קובץ לא תקין.");

  const { data: source, error: sourceError } = await supabase
    .from("data_sources")
    .insert({ organization_id: org.id, name: parsed.data.fileName, type: parsed.data.fileType, status: "importing" })
    .select("id")
    .single();
  if (sourceError) return fail(friendlyError(sourceError));

  const { data, error } = await supabase
    .from("imported_files")
    .insert({
      organization_id: org.id,
      data_source_id: source.id,
      file_name: parsed.data.fileName,
      file_type: parsed.data.fileType,
      storage_path: parsed.data.storagePath,
      row_count: parsed.data.rowCount,
      mapping: parsed.data.mapping,
      status: "importing",
    })
    .select("id")
    .single();
  if (error) return fail(friendlyError(error));
  return ok({ id: data.id });
}

// Records arrive already transformed by the browser; the server re-validates their shape.
const text = z.string().max(500);
const nullableText = text.nullable();
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const recordSchema = z.object({
  rowIndex: z.number().int().min(0),
  customer: z
    .object({
      name: text.min(1),
      email: nullableText,
      phone: nullableText,
      company: nullableText,
      status: z.enum(["active", "inactive", "lead", "churned"]),
      custom_fields: z.record(z.string().max(200), text),
    })
    .nullable(),
  transaction: z
    .object({
      date: isoDate,
      amount: z.number().finite().min(0).max(1e10),
      product_or_service: nullableText,
      owner_name: nullableText,
      status: z.enum(["paid", "pending", "cancelled", "refunded"]),
      type: z.enum(["sale", "refund", "subscription", "other"]),
    })
    .nullable(),
  lead: z
    .object({
      name: text.min(1),
      email: nullableText,
      phone: nullableText,
      source: nullableText,
      status: z.enum(["new", "contacted", "qualified", "converted", "lost"]),
      value: z.number().finite().nullable(),
      custom_fields: z.record(z.string().max(200), text),
    })
    .nullable(),
  deal: z
    .object({
      name: text.min(1),
      // Imports map stages onto the default keys; importChunk then fits them to the business's own stages.
      stage: z.enum(DEAL_STAGES),
      value: z.number().finite().min(0),
      expected_close: isoDate.nullable(),
      owner_name: nullableText,
    })
    .nullable(),
  activity: z
    .object({
      date: isoDate,
      type: z.enum(["appointment", "call", "meeting", "email", "note", "visit"]),
      notes: z.string().max(2000).nullable(),
    })
    .nullable(),
  serviceCategory: nullableText,
});

export interface ChunkStats {
  customersCreated: number;
  customersMatched: number;
  transactions: number;
  services: number;
  leads: number;
  deals: number;
  activities: number;
  /** Sales already in the system (same customer, date and amount) — skipped on re-import. */
  existingSkipped: number;
}

async function loadCustomerResolver(supabase: SupabaseClient, orgId: string) {
  const resolver = new CustomerResolver<string>();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from("customers")
      .select("id, name, email, phone")
      .eq("organization_id", orgId)
      .order("created_at")
      .range(from, from + 999);
    if (error) throw error;
    for (const c of data ?? []) resolver.add({ name: c.name, email: c.email?.toLowerCase() ?? null, phone: c.phone }, c.id);
    if (!data || data.length < 1000) break;
  }
  return resolver;
}

async function insertInBatches(supabase: SupabaseClient, table: string, rows: Record<string, unknown>[]) {
  for (let i = 0; i < rows.length; i += BATCH) {
    const { error } = await supabase.from(table).insert(rows.slice(i, i + BATCH));
    if (error) throw error;
  }
}

/** Writes one chunk of canonical records into the canonical tables. */
export async function importChunk(importId: string, records: CanonicalRecord[]): Promise<ActionResult<ChunkStats>> {
  if (!z.string().uuid().safeParse(importId).success) return fail("ייבוא לא תקין.");
  const parsed = z.array(recordSchema).max(2000).safeParse(records);
  if (!parsed.success) return fail("חלק מהשורות לא נקראו. נסה להעלות את הקובץ שוב.");
  const { supabase, org, user } = await requireOrg();

  try {
    const bundle = buildBundle(parsed.data as CanonicalRecord[]);
    const resolver = await loadCustomerResolver(supabase, org.id);
    const stats: ChunkStats = { customersCreated: 0, customersMatched: 0, transactions: 0, services: 0, leads: 0, deals: 0, activities: 0, existingSkipped: 0 };

    const customerIds: string[] = [];
    const matched = new Set<string>();
    const newCustomers: Record<string, unknown>[] = [];
    for (const c of bundle.customers) {
      const existing = resolver.find(c);
      if (existing) {
        customerIds.push(existing);
        matched.add(existing);
        stats.customersMatched++;
      } else {
        const id = randomUUID();
        customerIds.push(id);
        resolver.add(c, id);
        newCustomers.push({ id, organization_id: org.id, ...c, source_import_id: importId });
      }
    }
    await insertInBatches(supabase, "customers", newCustomers);
    stats.customersCreated = newCustomers.length;

    const serviceIds = new Map<string, string>();
    if (bundle.services.length) {
      const { error } = await supabase.from("services").upsert(
        bundle.services.map((s) => ({ organization_id: org.id, name: s.name, category: s.category, price: s.price })),
        { onConflict: "organization_id,name", ignoreDuplicates: true },
      );
      if (error) throw error;
      const { data } = await supabase
        .from("services")
        .select("id, name")
        .eq("organization_id", org.id)
        .in("name", bundle.services.map((s) => s.name));
      for (const s of data ?? []) serviceIds.set(s.name.toLowerCase(), s.id);
      stats.services = bundle.services.length;
    }

    const idFor = (i: number | null) => (i === null ? null : customerIds[i]);

    // Re-importing the same file must not double revenue: skip sales that already exist
    // for an existing customer on the same date with the same amount.
    const known = new Set<string>();
    const txKey = (customerId: string | null, date: string, amount: number) => `${customerId}|${date}|${Number(amount).toFixed(2)}`;
    const toCheck = [...new Set(bundle.transactions.map((t) => idFor(t.customerIndex)).filter((id): id is string => !!id && matched.has(id)))];
    for (let i = 0; i < toCheck.length; i += 100) {
      const { data, error } = await supabase
        .from("transactions")
        .select("customer_id, date, amount")
        .eq("organization_id", org.id)
        .in("customer_id", toCheck.slice(i, i + 100))
        .limit(20000);
      if (error) throw error;
      for (const t of data ?? []) known.add(txKey(t.customer_id, t.date, t.amount));
    }
    const freshTransactions = bundle.transactions.filter((t) => !known.has(txKey(idFor(t.customerIndex), t.date, t.amount)));
    stats.existingSkipped = bundle.transactions.length - freshTransactions.length;

    await insertInBatches(
      supabase,
      "transactions",
      freshTransactions.map(({ customerIndex, ...t }) => ({
        organization_id: org.id,
        customer_id: idFor(customerIndex),
        service_id: t.product_or_service ? serviceIds.get(t.product_or_service.toLowerCase()) ?? null : null,
        ...t,
        source_import_id: importId,
      })),
    );
    stats.transactions = freshTransactions.length;

    await insertInBatches(
      supabase,
      "leads",
      bundle.leads.map((l) => ({ organization_id: org.id, owner_id: user.id, ...l, source_import_id: importId })),
    );
    stats.leads = bundle.leads.length;

    // A default stage the business removed goes to its first open stage (won/lost always exist).
    const stages = bundle.deals.length ? await loadStages(supabase, org.id) : [];
    const firstOpen = stages.find((s) => s.kind === "open")?.key ?? "new";
    const fitStage = (key: string): string =>
      stages.some((s) => s.key === key) ? key : (stages.find((s) => s.kind === key)?.key ?? firstOpen);
    await insertInBatches(
      supabase,
      "deals",
      bundle.deals.map(({ customerIndex, owner_name, ...d }) => ({
        organization_id: org.id,
        customer_id: idFor(customerIndex),
        owner_id: user.id,
        ...d,
        stage: fitStage(d.stage),
        custom_fields: owner_name ? { owner_name } : {},
        source_import_id: importId,
      })),
    );
    stats.deals = bundle.deals.length;

    await insertInBatches(
      supabase,
      "activities",
      bundle.activities.map(({ customerIndex, ...a }) => ({
        organization_id: org.id,
        customer_id: idFor(customerIndex),
        owner_id: user.id,
        ...a,
        source_import_id: importId,
      })),
    );
    stats.activities = bundle.activities.length;

    return ok(stats);
  } catch (error) {
    await supabase.from("imported_files").update({ status: "failed" }).eq("id", importId);
    return fail(friendlyError(error as Error));
  }
}

const statsSchema = z.object({
  total: z.number().int(),
  imported: z.number().int(),
  skipped: z.number().int(),
  customersCreated: z.number().int(),
  customersMatched: z.number().int(),
  transactions: z.number().int(),
  services: z.number().int(),
  leads: z.number().int(),
  deals: z.number().int(),
  activities: z.number().int(),
});

export async function finalizeImport(importId: string, stats: z.infer<typeof statsSchema>): Promise<ActionResult<null>> {
  const parsed = statsSchema.safeParse(stats);
  if (!z.string().uuid().safeParse(importId).success || !parsed.success) return fail("ייבוא לא תקין.");
  const { supabase, org } = await requireOrg();
  const { data, error } = await supabase
    .from("imported_files")
    .update({ status: "completed", stats: parsed.data })
    .eq("id", importId)
    .eq("organization_id", org.id)
    .select("data_source_id")
    .single();
  if (error) return fail(friendlyError(error));
  if (data?.data_source_id) await supabase.from("data_sources").update({ status: "active" }).eq("id", data.data_source_id);
  await supabase.from("organizations").update({ onboarding_completed: true }).eq("id", org.id);
  await supabase.from("ai_briefs").delete().eq("organization_id", org.id);
  revalidatePath("/", "layout");
  return ok(null);
}

export interface SpreadSummary {
  /** Tools already on the canvas, with whether they now have the data they need. */
  onCanvas: { type: string; name: string; ready: boolean }[];
  /** Tools not on the canvas yet that the data now unlocks. */
  unlocked: { type: string; name: string; description: string }[];
  canManage: boolean;
}

/** After an import: which canvas tools received data, and which new tools the data unlocks. */
export async function getSpreadSummary(): Promise<ActionResult<SpreadSummary>> {
  const { supabase, org, role } = await requireOrg();
  const [{ data: installed, error }, counts] = await Promise.all([
    supabase.from("components").select("component_type, position").eq("organization_id", org.id).order("position"),
    getDataCounts(supabase, org.id),
  ]);
  if (error) return fail(friendlyError(error));
  const installedTypes = new Set((installed ?? []).map((c) => c.component_type));
  const onCanvas = (installed ?? [])
    .map((c) => getDefinition(c.component_type))
    .filter((d): d is NonNullable<typeof d> => !!d)
    .map((d) => ({ type: d.id, name: d.name, ready: missingEntities(d, counts).length === 0 }));
  const unlocked = COMPONENT_REGISTRY.filter(
    (d) => !installedTypes.has(d.id) && d.requiredEntities.length > 0 && missingEntities(d, counts).length === 0 && d.recommendedFor.includes(org.business_type),
  ).map((d) => ({ type: d.id, name: d.name, description: d.description }));
  return ok({ onCanvas, unlocked, canManage: canManage(role) });
}

export interface ImportImpact {
  transactions: number;
  activities: number;
  deals: number;
  leads: number;
  customers: number;
}

const isMissingFunction = (code?: string) => code === "PGRST202" || code === "42883";

/** What deleting a file together with its data would remove — shown before the user confirms. */
export async function getImportImpact(importId: string): Promise<ActionResult<ImportImpact>> {
  if (!z.string().uuid().safeParse(importId).success) return fail("קובץ לא תקין.");
  const { supabase } = await requireOrg();
  const { data, error } = await supabase.rpc("import_impact", { p_import: importId });
  if (error) return fail(isMissingFunction(error.code) ? "לא הצלחנו לחשב מה יימחק." : friendlyError(error));
  return ok(data as ImportImpact);
}

export interface DeleteImportResult extends ImportImpact {
  customers_kept: number;
  services: number;
}

/**
 * Deletes an uploaded file. With `withData` it also removes every sale, appointment, deal and lead
 * that came from it, and the customers it created that nothing else refers to.
 */
export async function deleteImport(importId: string, withData: boolean): Promise<ActionResult<DeleteImportResult>> {
  if (!z.string().uuid().safeParse(importId).success) return fail("קובץ לא תקין.");
  const { supabase, org, role } = await requireOrg();
  if (!canManage(role)) return fail("רק בעלי החשבון או מנהלים יכולים למחוק קבצים.");

  const { data, error } = await supabase.rpc("delete_import", { p_import: importId, p_with_data: withData });
  if (error) {
    if (isMissingFunction(error.code)) return fail("מחיקת קבצים עוד לא הופעלה בחשבון. נסה שוב מאוחר יותר.");
    if (error.code === "P0002") return fail("הקובץ כבר נמחק.");
    return fail(friendlyError(error));
  }
  const result = data as DeleteImportResult & { storage_path: string | null };
  if (result.storage_path && result.storage_path.startsWith(`${org.id}/`)) {
    const { error: storageError } = await supabase.storage.from("imports").remove([result.storage_path]);
    if (storageError) console.error("[deleteImport] storage", storageError.message);
  }
  revalidatePath("/", "layout");
  return ok({
    transactions: result.transactions,
    activities: result.activities,
    deals: result.deals,
    leads: result.leads,
    customers: result.customers,
    customers_kept: result.customers_kept,
    services: result.services,
  });
}
