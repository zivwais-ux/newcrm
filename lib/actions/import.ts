"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireOrg } from "@/lib/supabase/server";
import { buildBundle, CustomerResolver, type CanonicalRecord } from "@/lib/data-mapping/transform";
import type { ActionResult } from "@/types/domain";
import { fail, friendlyError, ok } from "./errors";

const BATCH = 500;

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
  if (!parsed.success) return fail("This file can't be imported.");
  const { supabase, org } = await requireOrg();
  if (parsed.data.storagePath && !parsed.data.storagePath.startsWith(`${org.id}/`)) return fail("Invalid file location.");

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
      stage: z.enum(["new", "contacted", "qualified", "proposal", "negotiation", "won", "lost"]),
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
  if (!z.string().uuid().safeParse(importId).success) return fail("Invalid import.");
  const parsed = z.array(recordSchema).max(2000).safeParse(records);
  if (!parsed.success) return fail("Some rows couldn't be read. Please re-validate the file.");
  const { supabase, org, user } = await requireOrg();

  try {
    const bundle = buildBundle(parsed.data as CanonicalRecord[]);
    const resolver = await loadCustomerResolver(supabase, org.id);
    const stats: ChunkStats = { customersCreated: 0, customersMatched: 0, transactions: 0, services: 0, leads: 0, deals: 0, activities: 0 };

    const customerIds: string[] = [];
    const newCustomers: Record<string, unknown>[] = [];
    for (const c of bundle.customers) {
      const existing = resolver.find(c);
      if (existing) {
        customerIds.push(existing);
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

    await insertInBatches(
      supabase,
      "transactions",
      bundle.transactions.map(({ customerIndex, ...t }) => ({
        organization_id: org.id,
        customer_id: idFor(customerIndex),
        service_id: t.product_or_service ? serviceIds.get(t.product_or_service.toLowerCase()) ?? null : null,
        ...t,
        source_import_id: importId,
      })),
    );
    stats.transactions = bundle.transactions.length;

    await insertInBatches(
      supabase,
      "leads",
      bundle.leads.map((l) => ({ organization_id: org.id, owner_id: user.id, ...l, source_import_id: importId })),
    );
    stats.leads = bundle.leads.length;

    await insertInBatches(
      supabase,
      "deals",
      bundle.deals.map(({ customerIndex, owner_name, ...d }) => ({
        organization_id: org.id,
        customer_id: idFor(customerIndex),
        owner_id: user.id,
        ...d,
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
  if (!z.string().uuid().safeParse(importId).success || !parsed.success) return fail("Invalid import.");
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
