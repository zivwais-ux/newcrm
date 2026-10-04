"use server";

import { revalidatePath } from "next/cache";
import { requireOrg } from "@/lib/supabase/server";
import { generateDemoDataset } from "@/lib/demo/generator";
import { insertDemoDataset } from "@/lib/demo/insert";
import type { ActionResult } from "@/types/domain";
import { fail, friendlyError, ok } from "./errors";

/** Loads a realistic sample dataset (matching the business type) into the user's own workspace. */
export async function loadDemoData(): Promise<ActionResult<{ customers: number; transactions: number; deals: number }>> {
  const { supabase, org, user } = await requireOrg();
  const { count } = await supabase
    .from("customers")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", org.id);
  if (count) return fail("Your workspace already has customers. Sample data can only be loaded into an empty workspace.");

  const ds = generateDemoDataset(org.business_type);
  try {
    await insertDemoDataset(supabase, org.id, user.id, ds);
  } catch (error) {
    return fail(friendlyError(error as Error));
  }
  revalidatePath("/", "layout");
  return ok({ customers: ds.customers.length, transactions: ds.transactions.length, deals: ds.deals.length });
}
