"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient, getSession, requireOrg, canManage } from "@/lib/supabase/server";
import type { ActionResult } from "@/types/domain";
import { fail, friendlyError, ok } from "./errors";

const createOrgSchema = z.object({
  name: z.string().trim().min(1, "הכנס את שם העסק").max(120),
  businessType: z.enum(["service", "sales", "both"]),
  fullName: z.string().trim().max(120).optional(),
});

export async function createOrganization(input: z.infer<typeof createOrgSchema>): Promise<ActionResult<{ id: string }>> {
  const parsed = createOrgSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "בדוק את הפרטים בטופס.");
  const { supabase, user } = await getSession();
  if (!user) return fail("פג תוקף החיבור. היכנס שוב.");

  if (parsed.data.fullName) {
    await supabase.from("profiles").update({ full_name: parsed.data.fullName }).eq("id", user.id);
  }

  const { data, error } = await supabase.rpc("create_organization", {
    org_name: parsed.data.name,
    org_type: parsed.data.businessType,
  });
  if (error) return fail(friendlyError(error));
  revalidatePath("/", "layout");
  return ok({ id: data as string });
}

const dataSourceSchema = z.enum(["excel", "csv", "manual", "none"]);

export async function completeOnboarding(dataSource: z.infer<typeof dataSourceSchema>): Promise<ActionResult<{ next: string }>> {
  const parsed = dataSourceSchema.safeParse(dataSource);
  if (!parsed.success) return fail("בחר אחת מהאפשרויות.");
  const { supabase, org } = await requireOrg();
  const { error } = await supabase
    .from("organizations")
    .update({ onboarding_completed: true, data_source_pref: parsed.data })
    .eq("id", org.id);
  if (error) return fail(friendlyError(error));
  revalidatePath("/", "layout");
  const next = parsed.data === "excel" || parsed.data === "csv" ? "/data/import?welcome=1" : "/home";
  return ok({ next });
}

const settingsSchema = z.object({
  name: z.string().trim().min(1).max(120),
  businessType: z.enum(["service", "sales", "both"]),
  currency: z.enum(["ILS", "USD", "EUR", "GBP"]),
});

export async function updateOrganization(input: z.infer<typeof settingsSchema>): Promise<ActionResult<null>> {
  const parsed = settingsSchema.safeParse(input);
  if (!parsed.success) return fail("בדוק את הפרטים בטופס.");
  const { supabase, org, role } = await requireOrg();
  if (!canManage(role)) return fail("רק בעלים ומנהלים יכולים לשנות את הגדרות החשבון.");
  const { error } = await supabase
    .from("organizations")
    .update({ name: parsed.data.name, business_type: parsed.data.businessType, currency: parsed.data.currency })
    .eq("id", org.id);
  if (error) return fail(friendlyError(error));
  revalidatePath("/", "layout");
  return ok(null);
}

export async function updateProfileName(fullName: string): Promise<ActionResult<null>> {
  const name = z.string().trim().min(1).max(120).safeParse(fullName);
  if (!name.success) return fail("הכנס את השם שלך.");
  const { supabase, user } = await requireOrg();
  const { error } = await supabase.from("profiles").update({ full_name: name.data }).eq("id", user.id);
  if (error) return fail(friendlyError(error));
  revalidatePath("/", "layout");
  return ok(null);
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
