"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { canManage, requireOrg } from "@/lib/supabase/server";
import { getDataCounts } from "@/lib/analytics/queries";
import { entitiesText, getDefinition, missingEntities, resolveConfig, topRecommendations } from "@/lib/components/registry";
import type { ActionResult, EntityName } from "@/types/domain";
import { fail, friendlyError, ok } from "./errors";

type AddResult = ActionResult<{ id: string }> | { ok: false; error: string; missing: EntityName[] };
type Supabase = Awaited<ReturnType<typeof requireOrg>>["supabase"];

// RLS on public.components: only owners and admins may insert/update/delete.
const MANAGE_ONLY = "רק בעלים ומנהלים יכולים לשנות את מסך העבודה.";

function revalidateWorkspace() {
  revalidatePath("/home");
  revalidatePath("/components");
}

async function nextPosition(supabase: Supabase, orgId: string) {
  const { data, error } = await supabase
    .from("components")
    .select("position")
    .eq("organization_id", orgId)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data?.position ?? -1) + 1;
}

async function findInstalled(supabase: Supabase, orgId: string, type: string) {
  const { data, error } = await supabase
    .from("components")
    .select("id")
    .eq("organization_id", orgId)
    .eq("component_type", type)
    .maybeSingle();
  if (error) throw error;
  return data?.id ?? null;
}

/** Writes positions 0..n-1 in the given order; returns how many rows actually changed. */
async function writeOrder(supabase: Supabase, orgId: string, ids: string[]) {
  const results = await Promise.all(
    ids.map((id, position) =>
      supabase.from("components").update({ position }).eq("id", id).eq("organization_id", orgId).select("id"),
    ),
  );
  const failed = results.find((r) => r.error);
  if (failed?.error) throw failed.error;
  return results.reduce((n, r) => n + (r.data?.length ?? 0), 0);
}

/**
 * Verifies required data, then saves the Component to the workspace — at `position`
 * when it was dropped between other Components on the canvas, otherwise at the end.
 * Idempotent: a double click (or two tabs) returns the already-installed Component.
 */
export async function addComponent(componentType: string, position?: number): Promise<AddResult> {
  const def = getDefinition(componentType);
  if (!def) return fail("הכלי הזה לא קיים.");
  const { supabase, org, role } = await requireOrg();
  if (!canManage(role) || !def.permissions.manage.includes(role)) return fail("רק בעלים ומנהלים יכולים להוסיף כלים.");

  try {
    const counts = await getDataCounts(supabase, org.id);
    const missing = missingEntities(def, counts);
    if (missing.length) {
      return { ok: false, error: `הכלי "${def.name}" צריך ${entitiesText(missing)}.`, missing };
    }

    const existing = await findInstalled(supabase, org.id, def.id);
    if (existing) return ok({ id: existing });

    const { data, error } = await supabase
      .from("components")
      .insert({
        organization_id: org.id,
        component_type: def.id,
        name: def.name,
        config: resolveConfig(def, null),
        position: await nextPosition(supabase, org.id),
      })
      .select("id")
      .single();
    if (error) {
      // Unique (organization_id, component_type): a concurrent add already won — that's success.
      if (error.code === "23505") {
        const id = await findInstalled(supabase, org.id, def.id);
        if (id) {
          revalidateWorkspace();
          return ok({ id });
        }
      }
      return fail(friendlyError(error));
    }

    if (position !== undefined && Number.isInteger(position) && position >= 0) {
      // Dropped between Components: rewrite the order so it lands exactly there.
      const { data: rows, error: readError } = await supabase
        .from("components")
        .select("id")
        .eq("organization_id", org.id)
        .order("position");
      if (readError) throw readError;
      const ids = (rows ?? []).map((r) => r.id).filter((id) => id !== data.id);
      ids.splice(Math.min(position, ids.length), 0, data.id);
      // The Component is saved either way; a failed reorder only leaves it at the end.
      await writeOrder(supabase, org.id, ids).catch((e) => console.error("[addComponent] reorder", e));
    }
    revalidateWorkspace();
    return ok({ id: data.id });
  } catch (error) {
    return fail(friendlyError(error as Error));
  }
}

export async function addRecommendedComponents(): Promise<ActionResult<{ added: string[] }>> {
  const { supabase, org, role } = await requireOrg();
  if (!canManage(role)) return fail("רק בעלים ומנהלים יכולים להוסיף כלים.");
  try {
    const [{ data: installed, error: readError }, counts] = await Promise.all([
      supabase.from("components").select("component_type").eq("organization_id", org.id),
      getDataCounts(supabase, org.id),
    ]);
    if (readError) throw readError;
    const recs = topRecommendations(org.business_type, counts, new Set((installed ?? []).map((c) => c.component_type)));
    if (!recs.length) return ok({ added: [] });
    let position = await nextPosition(supabase, org.id);
    const rows = recs.map((r) => ({
      organization_id: org.id,
      component_type: r.definition.id,
      name: r.definition.name,
      config: resolveConfig(r.definition, null),
      position: position++,
    }));
    // Skip any Component a concurrent request already added (unique per org + type).
    const { data, error } = await supabase
      .from("components")
      .upsert(rows, { onConflict: "organization_id,component_type", ignoreDuplicates: true })
      .select("component_type");
    if (error) return fail(friendlyError(error));
    const inserted = new Set((data ?? []).map((r) => r.component_type));
    revalidateWorkspace();
    return ok({ added: recs.filter((r) => inserted.has(r.definition.id)).map((r) => r.definition.name) });
  } catch (error) {
    return fail(friendlyError(error as Error));
  }
}

export async function removeComponent(id: string): Promise<ActionResult<null>> {
  if (!z.string().uuid().safeParse(id).success) return fail("הכלי לא תקין.");
  const { supabase, org, role } = await requireOrg();
  if (!canManage(role)) return fail("רק בעלים ומנהלים יכולים להסיר כלים.");
  const { data, error } = await supabase
    .from("components")
    .delete()
    .eq("id", id)
    .eq("organization_id", org.id)
    .select("id");
  if (error) return fail(friendlyError(error));
  if (!data?.length) return fail("הכלי כבר לא נמצא במסך. רענן את העמוד.");
  revalidateWorkspace();
  return ok(null);
}

export async function reorderComponents(ids: string[]): Promise<ActionResult<null>> {
  const parsed = z.array(z.string().uuid()).max(50).safeParse(ids);
  if (!parsed.success) return fail("הסדר לא תקין.");
  const { supabase, org, role } = await requireOrg();
  if (!canManage(role)) return fail(MANAGE_ONLY);
  if (!parsed.data.length) return ok(null);
  try {
    const changed = await writeOrder(supabase, org.id, parsed.data);
    if (changed === 0) return fail("לא הצלחנו לשמור את הסדר. רענן את העמוד ונסה שוב.");
  } catch (error) {
    return fail(friendlyError(error as Error));
  }
  revalidateWorkspace();
  return ok(null);
}

export async function updateComponentConfig(id: string, patch: Record<string, string>): Promise<ActionResult<null>> {
  const parsedId = z.string().uuid().safeParse(id);
  const parsedPatch = z.record(z.string(), z.string().max(40)).safeParse(patch);
  if (!parsedId.success || !parsedPatch.success) return fail("ההגדרות לא תקינות.");
  const { supabase, org, role } = await requireOrg();
  if (!canManage(role)) return fail("רק בעלים ומנהלים יכולים לשנות את הגדרות הכלי.");
  const { data: row, error: readError } = await supabase
    .from("components")
    .select("component_type, config")
    .eq("id", id)
    .eq("organization_id", org.id)
    .maybeSingle();
  if (readError) return fail(friendlyError(readError));
  if (!row) return fail("הכלי כבר לא נמצא במסך. רענן את העמוד.");
  const def = getDefinition(row.component_type);
  if (!def) return fail("הכלי הזה לא קיים.");
  // Merge only the fields that changed onto the latest saved config.
  const config = resolveConfig(def, { ...(row.config as Record<string, unknown>), ...parsedPatch.data });
  const { data, error } = await supabase
    .from("components")
    .update({ config })
    .eq("id", id)
    .eq("organization_id", org.id)
    .select("id");
  if (error) return fail(friendlyError(error));
  if (!data?.length) return fail("לא הצלחנו לשמור את ההגדרות. רענן את העמוד ונסה שוב.");
  revalidatePath("/home");
  revalidatePath(`/components/${id}`);
  return ok(null);
}
