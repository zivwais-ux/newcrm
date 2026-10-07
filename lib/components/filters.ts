import { RANGE_PRESETS, type RangePreset } from "@/lib/analytics/dates";
import type { DealStage, StageDef } from "@/types/domain";
import type { FilterKey } from "./types";

/**
 * Workspace filters live in the URL (?range=&service=&stage=) so every Component
 * on the canvas reads the same context, links are shareable and the back button works.
 */
export interface WorkspaceFilters {
  range: RangePreset | null;
  service: string | null;
  stage: DealStage | null;
}

export const EMPTY_FILTERS: WorkspaceFilters = { range: null, service: null, stage: null };

type Params = Record<string, string | string[] | undefined> | URLSearchParams;

function get(params: Params, key: string): string | undefined {
  if (params instanceof URLSearchParams) return params.get(key) ?? undefined;
  const v = params[key];
  return Array.isArray(v) ? v[0] : v;
}

export function parseFilters(params: Params): WorkspaceFilters {
  const range = get(params, "range");
  const service = get(params, "service")?.trim().slice(0, 120);
  const stage = get(params, "stage");
  return {
    range: range && range in RANGE_PRESETS ? (range as RangePreset) : null,
    service: service ? service : null,
    // Stages are the business's own; any well-formed key is accepted (unknown keys just match nothing).
    stage: stage && STAGE_KEY.test(stage) ? stage : null,
  };
}

/** Shape of a stage key (default keys and the "s_…" keys businesses add). */
export const STAGE_KEY = /^[a-z0-9_]{1,40}$/;

export function activeFilterKeys(f: WorkspaceFilters): FilterKey[] {
  return (Object.keys(f) as FilterKey[]).filter((k) => f[k] !== null);
}

/** Hebrew names for the default deal stages — a fallback when the business's own stages aren't at hand. */
export const STAGE_NAMES: Record<string, string> = {
  new: "חדשה",
  contacted: "נוצר קשר",
  qualified: "רלוונטית",
  proposal: "הצעת מחיר",
  negotiation: "משא ומתן",
  won: "נסגרה בהצלחה",
  lost: "לא נסגרה",
};

/** The business's name for a stage when its stages are given, else the default name, else the key. */
export function stageName(key: string, stages?: StageDef[]): string {
  return stages?.find((s) => s.key === key)?.label ?? STAGE_NAMES[key] ?? key;
}

export function filterLabel(key: FilterKey, value: string, stages?: StageDef[]): string {
  if (key === "range") return RANGE_PRESETS[value as RangePreset] ?? value;
  if (key === "stage") return `שלב: ${stageName(value, stages)}`;
  return `שירות: ${value}`;
}

/** Human description used to give the AI analyst the same context the user sees. */
export function describeFilters(f: WorkspaceFilters, stages?: StageDef[]): string | null {
  const parts: string[] = [];
  if (f.service) parts.push(`רק השירות/המוצר "${f.service}"`);
  if (f.range) parts.push(`התקופה: ${RANGE_PRESETS[f.range]}`);
  if (f.stage) parts.push(`עסקאות בשלב "${stageName(f.stage, stages)}"`);
  return parts.length ? `התמקד ב: ${parts.join(", ")}.` : null;
}
