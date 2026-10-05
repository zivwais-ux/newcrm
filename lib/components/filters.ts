import { RANGE_PRESETS, type RangePreset } from "@/lib/analytics/dates";
import { DEAL_STAGES, type DealStage } from "@/types/domain";
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
    stage: stage && (DEAL_STAGES as readonly string[]).includes(stage) ? (stage as DealStage) : null,
  };
}

export function activeFilterKeys(f: WorkspaceFilters): FilterKey[] {
  return (Object.keys(f) as FilterKey[]).filter((k) => f[k] !== null);
}

export function filterLabel(key: FilterKey, value: string): string {
  if (key === "range") return RANGE_PRESETS[value as RangePreset] ?? value;
  if (key === "stage") return `Stage: ${value[0].toUpperCase()}${value.slice(1)}`;
  return `Service: ${value}`;
}

/** Human description used to give the AI analyst the same context the user sees. */
export function describeFilters(f: WorkspaceFilters): string | null {
  const parts: string[] = [];
  if (f.service) parts.push(`only the service/product "${f.service}"`);
  if (f.range) parts.push(`the period: ${RANGE_PRESETS[f.range].toLowerCase()}`);
  if (f.stage) parts.push(`deals in the "${f.stage}" stage`);
  return parts.length ? `Focus on ${parts.join(", ")}.` : null;
}
