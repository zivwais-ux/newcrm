"use server";

import { z } from "zod";
import { requireOrg } from "@/lib/supabase/server";
import type { ActionResult } from "@/types/domain";
import { fail, friendlyError, ok } from "./errors";

/**
 * The phone of one customer, for a WhatsApp message an agent prepared. The agents never
 * see phone numbers; the browser asks for it only when a person taps "send".
 */
export async function getCustomerPhone(customerId: string): Promise<ActionResult<{ phone: string | null; name: string | null }>> {
  if (!z.string().uuid().safeParse(customerId).success) return fail("הלקוח לא נמצא.");
  const { supabase, org } = await requireOrg();
  const { data, error } = await supabase.from("customers").select("name, phone").eq("id", customerId).eq("organization_id", org.id).maybeSingle();
  if (error) return fail(friendlyError(error));
  if (!data) return fail("הלקוח לא נמצא.");
  return ok({ phone: (data.phone as string | null) ?? null, name: (data.name as string | null) ?? null });
}
