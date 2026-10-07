// Fields the business defines itself. Definitions live in field_definitions; values live in each
// record's custom_fields jsonb under the field's key. Pure helpers (client and server).

import { formatDate } from "@/lib/utils";

export const FIELD_ENTITIES = ["customers", "transactions", "activities", "deals", "leads", "tasks"] as const;
export type FieldEntity = (typeof FIELD_ENTITIES)[number];

/** Entities whose table has a custom_fields column, so values can actually be stored. */
export const VALUE_ENTITIES: readonly FieldEntity[] = ["customers", "transactions", "activities", "deals", "leads", "tasks"];
export const canStoreValues = (entity: string): entity is FieldEntity => (VALUE_ENTITIES as readonly string[]).includes(entity);

export const FIELD_TYPES = ["text", "number", "money", "date", "select", "multiselect", "checkbox", "phone"] as const;
export type FieldType = (typeof FIELD_TYPES)[number];

export const FIELD_TYPE_LABELS: Record<FieldType, string> = {
  text: "טקסט",
  number: "מספר",
  money: "סכום",
  date: "תאריך",
  select: "בחירה אחת",
  multiselect: "כמה בחירות",
  checkbox: "כן / לא",
  phone: "טלפון",
};

export interface FieldDef {
  id: string;
  entity: FieldEntity;
  key: string;
  label: string;
  type: FieldType;
  options: string[];
  position: number;
  show_in_list: boolean;
}

/** Keys are ascii and stable even when the label changes: "f_" + short random id. */
export const newFieldKey = () => `f_${Math.random().toString(36).slice(2, 10)}`;

export type FieldValue = string | number | boolean | string[] | null;

/**
 * Turns raw input (form strings, imported cells) into the stored value for a field.
 * Returns { ok:false } with a Hebrew message when the value can't fit the field.
 */
export function coerceFieldValue(def: Pick<FieldDef, "type" | "options" | "label">, raw: unknown): { ok: true; value: FieldValue } | { ok: false; error: string } {
  if (raw === undefined || raw === null || (typeof raw === "string" && raw.trim() === "")) return { ok: true, value: null };
  switch (def.type) {
    case "text":
    case "phone": {
      const v = String(raw).trim().slice(0, 500);
      return { ok: true, value: v };
    }
    case "number":
    case "money": {
      const n = typeof raw === "number" ? raw : Number(String(raw).replace(/[₪,\s]/g, ""));
      if (!Number.isFinite(n)) return { ok: false, error: `"${def.label}" צריך להיות מספר` };
      return { ok: true, value: n };
    }
    case "date": {
      const s = String(raw).trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || Number.isNaN(Date.parse(s))) return { ok: false, error: `"${def.label}" צריך להיות תאריך` };
      return { ok: true, value: s };
    }
    case "checkbox": {
      if (typeof raw === "boolean") return { ok: true, value: raw };
      const s = String(raw).trim().toLowerCase();
      if (["true", "1", "yes", "כן", "v", "✓"].includes(s)) return { ok: true, value: true };
      if (["false", "0", "no", "לא"].includes(s)) return { ok: true, value: false };
      return { ok: false, error: `"${def.label}" צריך להיות כן או לא` };
    }
    case "select": {
      const s = String(raw).trim();
      // New options are allowed from imports/forms; the definition keeps the suggested list.
      return { ok: true, value: s.slice(0, 100) };
    }
    case "multiselect": {
      const list = Array.isArray(raw) ? raw.map(String) : String(raw).split(/[,;|]/);
      const clean = [...new Set(list.map((x) => x.trim()).filter(Boolean))].slice(0, 20);
      return { ok: true, value: clean.length ? clean : null };
    }
  }
}

/** Validates a whole custom_fields patch against the definitions of an entity. Unknown keys are dropped. */
export function coerceCustomFields(defs: FieldDef[], input: Record<string, unknown>): { ok: true; value: Record<string, FieldValue> } | { ok: false; error: string } {
  const out: Record<string, FieldValue> = {};
  for (const def of defs) {
    if (!(def.key in input)) continue;
    const res = coerceFieldValue(def, input[def.key]);
    if (!res.ok) return res;
    if (res.value !== null) out[def.key] = res.value;
  }
  return { ok: true, value: out };
}

/**
 * Applies a custom_fields patch from a form onto what a record already stores.
 * Only keys of the given definitions are touched: an empty value removes the key, anything else
 * is coerced. Every other key (legacy/imported raw columns like "הערה") is kept as is.
 */
export function mergeCustomFields(
  defs: FieldDef[],
  existing: Record<string, unknown> | null | undefined,
  input: Record<string, unknown>,
): { ok: true; value: Record<string, unknown> } | { ok: false; error: string } {
  const out: Record<string, unknown> = { ...(existing ?? {}) };
  for (const def of defs) {
    if (!(def.key in input)) continue;
    const res = coerceFieldValue(def, input[def.key]);
    if (!res.ok) return res;
    if (res.value === null) delete out[def.key];
    else out[def.key] = res.value;
  }
  return { ok: true, value: out };
}

/**
 * For imports: coerces the values that belong to a definition and drops cells that don't fit
 * (one bad cell never fails a whole file). Keys that aren't definitions stay untouched.
 */
export function coerceImportedFields(defs: FieldDef[], values: Record<string, unknown>): Record<string, unknown> {
  const byKey = new Map(defs.map((d) => [d.key, d]));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(values)) {
    const def = byKey.get(k);
    if (!def) {
      out[k] = v;
      continue;
    }
    const res = coerceFieldValue(def, v);
    if (res.ok && res.value !== null) out[k] = res.value;
  }
  return out;
}

/** Display text for a stored value. Money uses the business currency when given. */
export function formatFieldValue(def: Pick<FieldDef, "type">, value: unknown, currency?: string): string {
  if (value === null || value === undefined || value === "") return "";
  switch (def.type) {
    case "checkbox":
      return value === true || value === "true" ? "כן" : "לא";
    case "multiselect":
      return Array.isArray(value) ? value.join(", ") : String(value);
    case "money": {
      if (typeof value !== "number") return String(value);
      if (!currency) return `₪${value.toLocaleString("he-IL")}`;
      try {
        return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 2, minimumFractionDigits: 0 }).format(value);
      } catch {
        return value.toLocaleString("he-IL");
      }
    }
    case "number":
      return typeof value === "number" ? value.toLocaleString("he-IL") : String(value);
    case "date": {
      const s = String(value);
      return /^\d{4}-\d{2}-\d{2}/.test(s) ? formatDate(s) : s;
    }
    default:
      return String(value);
  }
}
