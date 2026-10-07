"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { canManage, requireOrg } from "@/lib/supabase/server";
import { FIELD_ENTITIES, FIELD_TYPES, newFieldKey, type FieldDef } from "@/lib/fields";
import type { ActionResult } from "@/types/domain";
import { fail, friendlyError, ok } from "./errors";

const fieldInput = z.object({
  /** Existing key, or null to create a new field. */
  key: z.string().regex(/^f_[a-z0-9_]{1,40}$/).nullable(),
  label: z.string().trim().min(1, "לכל שדה צריך שם").max(60),
  type: z.enum(FIELD_TYPES),
  options: z.array(z.string().trim().min(1).max(100)).max(50).default([]),
  show_in_list: z.boolean().default(false),
});

const saveSchema = z.object({
  entity: z.enum(FIELD_ENTITIES),
  fields: z.array(fieldInput).max(40, "אפשר עד 40 שדות לכל סוג"),
});

/**
 * Saves the full ordered list of fields for one entity. Fields left out are archived (never dropped),
 * so values already stored on records stay intact and come back if the field is restored.
 */
export async function saveFields(input: z.input<typeof saveSchema>): Promise<ActionResult<{ keys: string[] }>> {
  const parsed = saveSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "בדוק את השדות.");
  const { supabase, org, role } = await requireOrg();
  if (!canManage(role)) return fail("רק בעלים ומנהלים יכולים לשנות שדות.");
  const { entity, fields } = parsed.data;

  const labels = fields.map((f) => f.label);
  if (new Set(labels).size !== labels.length) return fail("יש שני שדות עם אותו שם.");
  if (fields.some((f) => (f.type === "select" || f.type === "multiselect") && !f.options.length)) {
    return fail("לשדה בחירה צריך לפחות אפשרות אחת.");
  }

  const { data: current, error: readError } = await supabase
    .from("field_definitions")
    .select("key, archived")
    .eq("organization_id", org.id)
    .eq("entity", entity);
  if (readError) return fail(friendlyError(readError));
  const existing = new Set((current ?? []).map((f) => f.key as string));

  const rows = fields.map((f, position) => ({
    organization_id: org.id,
    entity,
    key: f.key && existing.has(f.key) ? f.key : newFieldKey(),
    label: f.label,
    type: f.type,
    options: f.type === "select" || f.type === "multiselect" ? f.options : [],
    position,
    show_in_list: f.show_in_list,
    archived: false,
  }));
  if (rows.length) {
    const { error } = await supabase.from("field_definitions").upsert(rows, { onConflict: "organization_id,entity,key" });
    if (error) return fail(friendlyError(error));
  }

  const keep = new Set(rows.map((r) => r.key));
  const toArchive = (current ?? []).filter((f) => !f.archived && !keep.has(f.key as string)).map((f) => f.key as string);
  if (toArchive.length) {
    const { error } = await supabase
      .from("field_definitions")
      .update({ archived: true })
      .eq("organization_id", org.id)
      .eq("entity", entity)
      .in("key", toArchive);
    if (error) return fail(friendlyError(error));
  }

  revalidatePath("/", "layout");
  return ok({ keys: rows.map((r) => r.key) });
}

/** Creates one field on the fly (e.g. "new field…" while mapping an imported column). */
export async function createField(input: { entity: FieldDef["entity"]; label: string; type: FieldDef["type"]; options?: string[] }): Promise<ActionResult<FieldDef>> {
  const parsed = z
    .object({ entity: z.enum(FIELD_ENTITIES), label: z.string().trim().min(1).max(60), type: z.enum(FIELD_TYPES), options: z.array(z.string().trim().min(1).max(100)).max(50).default([]) })
    .safeParse(input);
  if (!parsed.success) return fail("השדה לא תקין.");
  const { supabase, org, role } = await requireOrg();
  if (!canManage(role)) return fail("רק בעלים ומנהלים יכולים להוסיף שדות.");
  const { data: last } = await supabase
    .from("field_definitions")
    .select("position")
    .eq("organization_id", org.id)
    .eq("entity", parsed.data.entity)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();
  const { data, error } = await supabase
    .from("field_definitions")
    .insert({ organization_id: org.id, ...parsed.data, key: newFieldKey(), position: (last?.position ?? -1) + 1 })
    .select("id, entity, key, label, type, options, position, show_in_list")
    .single();
  if (error) return fail(error.code === "23505" ? "כבר יש שדה כזה." : friendlyError(error));
  revalidatePath("/", "layout");
  return ok(data as FieldDef);
}
