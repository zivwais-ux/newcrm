"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireOrg } from "@/lib/supabase/server";
import { getDataCounts } from "@/lib/analytics/queries";
import { getDefinition, missingEntities, resolveConfig, topRecommendations } from "@/lib/components/registry";
import type { ActionResult, EntityName } from "@/types/domain";
import { fail, friendlyError, ok } from "./errors";

type AddResult = ActionResult<{ id: string }> | { ok: false; error: string; missing: EntityName[] };

function revalidateWorkspace() {
  revalidatePath("/home");
  revalidatePath("/components");
}

async function nextPosition(supabase: Awaited<ReturnType<typeof requireOrg>>["supabase"], orgId: string) {
  const { data } = await supabase
    .from("components")
    .select("position")
    .eq("organization_id", orgId)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data?.position ?? -1) + 1;
}

/**
 * Verifies required data, then saves the Component to the workspace — at `position`
 * when it was dropped between other Components on the canvas, otherwise at the end.
 */
export async function addComponent(componentType: string, position?: number): Promise<AddResult> {
  const def = getDefinition(componentType);
  if (!def) return fail("הכלי הזה לא קיים.");
  const { supabase, org, role } = await requireOrg();
  if (!def.permissions.manage.includes(role)) return fail("רק בעלים ומנהלים יכולים להוסיף כלים.");

  const counts = await getDataCounts(supabase, org.id);
  const missing = missingEntities(def, counts);
  if (missing.length) {
    return { ok: false, error: `This Component needs ${missing.join(" and ")} data.`, missing };
  }

  const { data: existing } = await supabase
    .from("components")
    .select("id")
    .eq("organization_id", org.id)
    .eq("component_type", def.id)
    .maybeSingle();
  if (existing) return ok({ id: existing.id });

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
  if (!error && position !== undefined && Number.isInteger(position) && position >= 0) {
    // Dropped between Components: rewrite the order so it lands exactly there.
    const { data: rows } = await supabase.from("components").select("id").eq("organization_id", org.id).order("position");
    const ids = (rows ?? []).map((r) => r.id).filter((id) => id !== data.id);
    ids.splice(Math.min(position, ids.length), 0, data.id);
    await Promise.all(ids.map((id, i) => supabase.from("components").update({ position: i }).eq("id", id).eq("organization_id", org.id)));
  }
  if (error) return fail(friendlyError(error));
  revalidateWorkspace();
  return ok({ id: data.id });
}

export async function addRecommendedComponents(): Promise<ActionResult<{ added: string[] }>> {
  const { supabase, org, role } = await requireOrg();
  if (role === "member") return fail("רק בעלים ומנהלים יכולים להוסיף כלים.");
  const [{ data: installed }, counts] = await Promise.all([
    supabase.from("components").select("component_type").eq("organization_id", org.id),
    getDataCounts(supabase, org.id),
  ]);
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
  const { error } = await supabase.from("components").insert(rows);
  if (error) return fail(friendlyError(error));
  revalidateWorkspace();
  return ok({ added: recs.map((r) => r.definition.name) });
}

export async function removeComponent(id: string): Promise<ActionResult<null>> {
  if (!z.string().uuid().safeParse(id).success) return fail("הכלי לא תקין.");
  const { supabase, org } = await requireOrg();
  const { error, count } = await supabase
    .from("components")
    .delete({ count: "exact" })
    .eq("id", id)
    .eq("organization_id", org.id);
  if (error) return fail(friendlyError(error));
  if (!count) return fail("רק בעלים ומנהלים יכולים להסיר כלים.");
  revalidateWorkspace();
  return ok(null);
}

export async function reorderComponents(ids: string[]): Promise<ActionResult<null>> {
  const parsed = z.array(z.string().uuid()).max(50).safeParse(ids);
  if (!parsed.success) return fail("הסדר לא תקין.");
  const { supabase, org } = await requireOrg();
  const results = await Promise.all(
    parsed.data.map((id, position) =>
      supabase.from("components").update({ position }).eq("id", id).eq("organization_id", org.id),
    ),
  );
  const failed = results.find((r) => r.error);
  if (failed?.error) return fail(friendlyError(failed.error));
  revalidatePath("/home");
  return ok(null);
}

export async function updateComponentConfig(id: string, patch: Record<string, string>): Promise<ActionResult<null>> {
  const parsedId = z.string().uuid().safeParse(id);
  const parsedPatch = z.record(z.string(), z.string().max(40)).safeParse(patch);
  if (!parsedId.success || !parsedPatch.success) return fail("ההגדרות לא תקינות.");
  const { supabase, org } = await requireOrg();
  const { data: row, error: readError } = await supabase
    .from("components")
    .select("component_type, config")
    .eq("id", id)
    .eq("organization_id", org.id)
    .single();
  if (readError || !row) return fail(friendlyError(readError));
  const def = getDefinition(row.component_type);
  if (!def) return fail("הכלי הזה לא קיים.");
  const config = resolveConfig(def, { ...(row.config as Record<string, unknown>), ...parsedPatch.data });
  const { error, count } = await supabase
    .from("components")
    .update({ config }, { count: "exact" })
    .eq("id", id)
    .eq("organization_id", org.id);
  if (error) return fail(friendlyError(error));
  if (!count) return fail("רק בעלים ומנהלים יכולים לשנות את הגדרות הכלי.");
  revalidatePath("/home");
  revalidatePath(`/components/${id}`);
  return ok(null);
}
