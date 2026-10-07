"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { canManage, requireOrg } from "@/lib/supabase/server";
import { TERM_KEYS, compactTerms } from "@/lib/terms";
import { newStageKey } from "@/lib/stages";
import type { ActionResult } from "@/types/domain";
import { fail, friendlyError, ok } from "./errors";

// The business shapes the app to itself: its own words and its own stages.

const termsSchema = z.partialRecord(z.enum(TERM_KEYS), z.string().max(30));

export async function updateTerms(terms: z.input<typeof termsSchema>): Promise<ActionResult<null>> {
  const parsed = termsSchema.safeParse(terms);
  if (!parsed.success) return fail("המילים לא תקינות.");
  const { supabase, org, role } = await requireOrg();
  if (!canManage(role)) return fail("רק בעלים ומנהלים יכולים לשנות את המילים של העסק.");
  const { data, error } = await supabase
    .from("organizations")
    .update({ terms: compactTerms(parsed.data) })
    .eq("id", org.id)
    .select("id");
  if (error) return fail(friendlyError(error));
  if (!data?.length) return fail("לא הצלחנו לשמור. רענן את העמוד ונסה שוב.");
  revalidatePath("/", "layout");
  return ok(null);
}

const stageInput = z.object({
  /** Existing stage key, or null for a new stage. */
  key: z.string().regex(/^[a-z0-9_]{1,40}$/).nullable(),
  label: z.string().trim().min(1, "לכל שלב צריך שם").max(60),
  kind: z.enum(["open", "won", "lost"]),
});
const stagesSchema = z
  .array(stageInput)
  .min(3, "צריך לפחות שלב פתוח אחד, שלב הצלחה ושלב כישלון")
  .max(20, "אפשר עד 20 שלבים")
  .refine((l) => l.filter((s) => s.kind === "won").length === 1 && l.filter((s) => s.kind === "lost").length === 1, "צריך שלב הצלחה אחד ושלב כישלון אחד")
  .refine((l) => l.some((s) => s.kind === "open"), "צריך לפחות שלב פתוח אחד");

/**
 * Saves the full ordered list of stages. Renames and reorders in place, adds new ones, and archives
 * open stages that were removed — after moving their deals to `moveTo` (default: the first open stage).
 */
export async function saveStages(
  input: z.input<typeof stagesSchema>,
  moveTo?: string,
): Promise<ActionResult<{ moved: number }>> {
  const parsed = stagesSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "בדוק את השלבים.");
  const { supabase, org, role } = await requireOrg();
  if (!canManage(role)) return fail("רק בעלים ומנהלים יכולים לשנות את שלבי העבודה.");

  const { data: current, error: readError } = await supabase
    .from("deal_stages")
    .select("key, kind, archived")
    .eq("organization_id", org.id);
  if (readError) return fail(friendlyError(readError));
  const existing = new Map((current ?? []).map((s) => [s.key as string, s]));

  // won/lost keep their keys; a submitted won/lost row maps onto them.
  const list = parsed.data.map((s) => ({
    ...s,
    key: s.kind === "won" ? "won" : s.kind === "lost" ? "lost" : s.key && existing.has(s.key) ? s.key : newStageKey(),
  }));
  const keep = new Set(list.map((s) => s.key));
  const removed = (current ?? []).filter((s) => !s.archived && s.kind === "open" && !keep.has(s.key)).map((s) => s.key as string);

  // Upsert (rename / reorder / add). Archived stages that come back are un-archived.
  const { error: upsertError } = await supabase.from("deal_stages").upsert(
    list.map((s, position) => ({ organization_id: org.id, key: s.key, label: s.label, kind: s.kind, position, archived: false })),
    { onConflict: "organization_id,key" },
  );
  if (upsertError) {
    if (upsertError.code === "23514") return fail("שלב חדש עוד לא נתמך בחשבון. אפשר לשנות שמות וסדר בינתיים.");
    return fail(friendlyError(upsertError));
  }

  let moved = 0;
  if (removed.length) {
    const target = moveTo && keep.has(moveTo) ? moveTo : list.find((s) => s.kind === "open")!.key;
    const { data: movedRows, error: moveError } = await supabase
      .from("deals")
      .update({ stage: target })
      .eq("organization_id", org.id)
      .in("stage", removed)
      .select("id");
    if (moveError) return fail(friendlyError(moveError));
    moved = movedRows?.length ?? 0;
    const { error: archiveError } = await supabase
      .from("deal_stages")
      .update({ archived: true })
      .eq("organization_id", org.id)
      .in("key", removed);
    if (archiveError) return fail(friendlyError(archiveError));
  }

  revalidatePath("/", "layout");
  return ok({ moved });
}
