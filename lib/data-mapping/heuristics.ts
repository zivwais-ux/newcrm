// Deterministic column mapping: header synonyms + value sniffing.
// Always runs — as the fallback when AI is unavailable and as a sanity check on AI output.

import {
  CANONICAL_FIELDS,
  CUSTOM,
  FIELD_BY_KEY,
  type CanonicalField,
  type ColumnMapping,
  type FieldType,
} from "./canonical-schema";
import { clean, isEmail, isPhone, parseDate, parseMoney } from "./values";

export type RawRow = Record<string, unknown>;

export function normalizeHeader(header: string): string {
  return header
    .toLowerCase()
    .replace(/[_\-./]+/g, " ")
    .replace(/[^\p{L}\p{N}" ]+/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

export interface ColumnProfile {
  column: string;
  filled: number;
  emailRatio: number;
  phoneRatio: number;
  dateRatio: number;
  moneyRatio: number;
  distinctRatio: number;
  avgLength: number;
}

export function profileColumn(column: string, rows: RawRow[]): ColumnProfile {
  const values = rows.map((r) => r[column]).filter((v) => clean(v) !== "");
  const n = values.length || 1;
  const strings = values.map(clean);
  return {
    column,
    filled: values.length,
    emailRatio: values.filter(isEmail).length / n,
    phoneRatio: values.filter(isPhone).length / n,
    dateRatio: values.filter((v) => parseDate(v) !== null && !/^\d{1,4}(\.\d+)?$/.test(clean(v))).length / n,
    moneyRatio: values.filter((v) => parseMoney(v) !== null).length / n,
    distinctRatio: new Set(strings).size / n,
    avgLength: strings.reduce((s, v) => s + v.length, 0) / n,
  };
}

function headerScore(header: string, field: CanonicalField): number {
  const h = normalizeHeader(header);
  if (!h) return 0;
  let best = 0;
  for (const syn of field.synonyms) {
    const s = normalizeHeader(syn);
    if (h === s) best = Math.max(best, 1);
    else if (h.includes(s) && s.length >= 4) best = Math.max(best, 0.75 + Math.min(0.15, s.length / 100));
    else if (s.includes(h) && h.length >= 4) best = Math.max(best, 0.6);
    else {
      const ht = new Set(h.split(" "));
      const st = s.split(" ");
      const overlap = st.filter((t) => ht.has(t)).length;
      if (overlap && st.length > 1) best = Math.max(best, 0.45 + 0.1 * overlap);
    }
  }
  return best;
}

function typeFit(type: FieldType, p: ColumnProfile): number {
  if (p.filled === 0) return 0.5;
  switch (type) {
    case "email":
      return p.emailRatio;
    case "phone":
      return p.phoneRatio;
    case "date":
      return p.dateRatio;
    case "money":
      return p.moneyRatio * (p.dateRatio > 0.5 ? 0.2 : 1) * (p.phoneRatio > 0.5 ? 0.2 : 1);
    case "text":
    case "enum":
      return p.emailRatio > 0.6 || p.dateRatio > 0.6 || (p.moneyRatio > 0.9 && p.phoneRatio < 0.5) ? 0.15 : 1;
  }
}

/** Scores every (column, field) pair, then assigns greedily so each field is used once. */
export function suggestMappings(headers: string[], rows: RawRow[]): ColumnMapping[] {
  const profiles = new Map(headers.map((h) => [h, profileColumn(h, rows)]));
  const candidates: { column: string; field: CanonicalField; score: number; reason: string }[] = [];

  for (const column of headers) {
    const p = profiles.get(column)!;
    for (const field of CANONICAL_FIELDS) {
      const hs = headerScore(column, field);
      const fit = typeFit(field.type, p);
      let score = 0;
      let reason = "";
      if (hs > 0) {
        score = hs * (0.55 + 0.45 * fit);
        reason = fit > 0.8 ? "הכותרת והערכים תואמים" : "הכותרת תואמת";
      }
      // Strong value signals can map a column even when the header is unknown.
      if (field.type === "email" && p.emailRatio > 0.8) {
        const s = 0.9 + 0.08 * p.emailRatio;
        if (s > score) [score, reason] = [s, "הערכים נראים כמו כתובות מייל"];
      }
      if (field.type === "phone" && p.phoneRatio > 0.8 && hs === 0) {
        const s = 0.7 * p.phoneRatio;
        if (s > score) [score, reason] = [s, "הערכים נראים כמו מספרי טלפון"];
      }
      if (score > 0.3) candidates.push({ column, field, score: Math.min(score, 0.99), reason });
    }
  }

  candidates.sort((a, b) => b.score - a.score);
  const usedColumns = new Set<string>();
  const usedFields = new Set<string>();
  const result = new Map<string, ColumnMapping>();

  for (const c of candidates) {
    if (usedColumns.has(c.column) || usedFields.has(c.field.key)) continue;
    usedColumns.add(c.column);
    usedFields.add(c.field.key);
    result.set(c.column, {
      column: c.column,
      target: c.field.key,
      confidence: Math.round(c.score * 100) / 100,
      reason: c.reason,
      source: "heuristic",
    });
  }

  return headers.map(
    (column) =>
      result.get(column) ?? {
        column,
        target: CUSTOM,
        confidence: 0.3,
        reason: "לא זוהה — יישמר כשדה נוסף",
        source: "heuristic",
      },
  );
}

/** Ensures each canonical field is used at most once (later duplicates fall back to custom). */
export function dedupeTargets(mapping: ColumnMapping[]): ColumnMapping[] {
  const seen = new Set<string>();
  return mapping.map((m) => {
    if (!FIELD_BY_KEY.has(m.target)) return m;
    if (seen.has(m.target)) return { ...m, target: CUSTOM, confidence: 0.3, reason: "כפילות — יישמר כשדה נוסף" };
    seen.add(m.target);
    return m;
  });
}
