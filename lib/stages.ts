import type { SupabaseClient } from "@supabase/supabase-js";
import { DEAL_STAGES, type StageDef } from "@/types/domain";
import { STAGE_LABELS } from "@/components/business/labels";
import type { FieldDef } from "@/lib/fields";

/** The stages every organization starts with (used until its own are loaded). */
export const DEFAULT_STAGES: StageDef[] = DEAL_STAGES.map((key, position) => ({
  key,
  label: STAGE_LABELS[key],
  kind: key === "won" ? "won" : key === "lost" ? "lost" : "open",
  position,
}));

/** The organization's active stages, in its own order. */
export async function loadStages(supabase: SupabaseClient, orgId: string): Promise<StageDef[]> {
  const { data, error } = await supabase
    .from("deal_stages")
    .select("key, label, kind, position")
    .eq("organization_id", orgId)
    .eq("archived", false)
    .order("position");
  if (error || !data?.length) return DEFAULT_STAGES;
  return data as StageDef[];
}

export function stageLabel(key: string | null | undefined, stages: StageDef[]) {
  if (!key) return "";
  return stages.find((s) => s.key === key)?.label ?? DEFAULT_STAGES.find((s) => s.key === key)?.label ?? key;
}

export const isOpenStage = (key: string, stages: StageDef[]) => (stages.find((s) => s.key === key)?.kind ?? "open") === "open";

/** Stage keys are ascii: "s_" + a short random id for stages the business adds. */
export const newStageKey = () => `s_${Math.random().toString(36).slice(2, 10)}`;

/** All active custom field definitions of the organization, grouped later by entity. */
export async function loadFields(supabase: SupabaseClient, orgId: string): Promise<FieldDef[]> {
  const { data, error } = await supabase
    .from("field_definitions")
    .select("id, entity, key, label, type, options, position, show_in_list")
    .eq("organization_id", orgId)
    .eq("archived", false)
    .order("position");
  if (error) return [];
  return (data ?? []) as FieldDef[];
}
