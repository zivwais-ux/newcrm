import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { DEFAULT_TEMPLATES, type MessageTemplate } from "./whatsapp";

/** The business's saved templates, or the built-in ones when none were saved yet. */
export async function loadTemplates(supabase: SupabaseClient, orgId: string): Promise<MessageTemplate[]> {
  const { data, error } = await supabase
    .from("message_templates")
    .select("id, name, body")
    .eq("organization_id", orgId)
    .order("position");
  if (error || !data?.length) return DEFAULT_TEMPLATES;
  return data;
}
