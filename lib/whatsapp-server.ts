import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { defaultTemplates, type MessageTemplate } from "./whatsapp";
import type { Terms } from "./terms";

/** The business's saved templates, or the built-in ones (in its own words) when none were saved yet. */
export async function loadTemplates(supabase: SupabaseClient, orgId: string, terms?: Terms): Promise<MessageTemplate[]> {
  const { data, error } = await supabase
    .from("message_templates")
    .select("id, name, body")
    .eq("organization_id", orgId)
    .order("position");
  if (error || !data?.length) return defaultTemplates(terms);
  return data;
}
