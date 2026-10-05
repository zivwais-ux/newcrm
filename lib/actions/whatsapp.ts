"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireOrg } from "@/lib/supabase/server";
import type { ActionResult } from "@/types/domain";
import { fail, friendlyError, ok } from "./errors";

const templatesSchema = z
  .array(
    z.object({
      name: z.string().trim().min(1, "לכל תבנית צריך שם").max(60),
      body: z.string().trim().min(1, "תבנית ריקה").max(1000),
    }),
  )
  .min(1, "צריך לפחות תבנית אחת")
  .max(20);

/** Replaces the business's templates (owners and admins). */
export async function saveTemplates(input: z.input<typeof templatesSchema>): Promise<ActionResult<null>> {
  const parsed = templatesSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "התבניות לא תקינות.");
  const { supabase, org, role } = await requireOrg();
  if (role !== "owner" && role !== "admin") return fail("רק בעלים ומנהלים יכולים לערוך תבניות.");
  const { error: delError } = await supabase.from("message_templates").delete().eq("organization_id", org.id);
  if (delError) return fail(friendlyError(delError));
  const { error } = await supabase
    .from("message_templates")
    .insert(parsed.data.map((t, i) => ({ organization_id: org.id, name: t.name, body: t.body, position: i })));
  if (error) return fail(friendlyError(error));
  revalidatePath("/", "layout");
  return ok(null);
}

const logSchema = z.object({
  customerId: z.string().uuid().nullable(),
  dealId: z.string().uuid().nullable().optional(),
  template: z.string().max(60),
  text: z.string().max(1000),
});

/** Records that a WhatsApp message was opened for a customer, so it shows in their history. */
export async function logWhatsApp(input: z.input<typeof logSchema>): Promise<ActionResult<null>> {
  const parsed = logSchema.safeParse(input);
  if (!parsed.success) return fail("לא הצלחנו לרשום את ההודעה.");
  const { supabase, org, user } = await requireOrg();
  const { error } = await supabase.from("activities").insert({
    organization_id: org.id,
    customer_id: parsed.data.customerId,
    deal_id: parsed.data.dealId ?? null,
    owner_id: user.id,
    type: "whatsapp",
    date: new Date().toISOString(),
    notes: `${parsed.data.template}: ${parsed.data.text}`.slice(0, 2000),
  });
  if (error) return fail(friendlyError(error));
  revalidatePath("/", "layout");
  return ok(null);
}
