import type { SupabaseClient } from "@supabase/supabase-js";
import type { DemoDataset } from "./generator";

const BATCH = 500;

async function insertAll(supabase: SupabaseClient, table: string, rows: Record<string, unknown>[]) {
  for (let i = 0; i < rows.length; i += BATCH) {
    const { error } = await supabase.from(table).insert(rows.slice(i, i + BATCH));
    if (error) throw Object.assign(new Error(`${table}: ${error.message}`), { code: error.code });
  }
}

/** Writes a demo dataset into an organization. Works with a user-scoped (RLS) or admin client. */
export async function insertDemoDataset(supabase: SupabaseClient, orgId: string, ownerId: string, ds: DemoDataset) {
  const org = { organization_id: orgId };
  const { data: source } = await supabase
    .from("data_sources")
    .insert({ ...org, name: `${ds.label} (sample data)`, type: "demo" })
    .select("id")
    .single();

  await insertAll(supabase, "services", ds.services.map((s) => ({ ...org, ...s })));
  await insertAll(supabase, "customers", ds.customers.map((c) => ({ ...org, ...c, owner_id: ownerId, updated_at: c.created_at })));
  await insertAll(supabase, "transactions", ds.transactions.map((t) => ({ ...org, ...t })));
  await insertAll(supabase, "leads", ds.leads.map((l) => ({ ...org, ...l, owner_id: ownerId, updated_at: l.created_at })));
  await insertAll(supabase, "deals", ds.deals.map((d) => ({ ...org, ...d, owner_id: ownerId, updated_at: d.last_activity_at })));
  await insertAll(supabase, "activities", ds.activities.map((a) => ({ ...org, ...a, owner_id: ownerId })));
  await insertAll(supabase, "tasks", ds.tasks.map((t) => ({ ...org, ...t, assigned_to: ownerId, created_by: ownerId })));
  await supabase.from("ai_briefs").delete().eq("organization_id", orgId);
  return { sourceId: source?.id ?? null };
}
