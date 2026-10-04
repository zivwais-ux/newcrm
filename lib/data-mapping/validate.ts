// Pre-import validation. Pure: runs in the browser over every row so the user sees
// exact counts before anything is written. Minor problems never block the import.

import type { ColumnMapping } from "./canonical-schema";
import type { RawRow } from "./heuristics";
import {
  buildMappingContext,
  recordSignature,
  toCanonical,
  type CanonicalRecord,
  type IssueType,
} from "./transform";

export interface RowIssue {
  rowIndex: number; // 0-based index into data rows
  issues: IssueType[];
}

export interface ValidationResult {
  total: number;
  valid: number;
  duplicates: number;
  issueCounts: Partial<Record<IssueType, number>>;
  rowIssues: RowIssue[];
  validRecords: CanonicalRecord[];
  entities: string[];
  /** Mapping problems that make the import meaningless (e.g. nothing mapped). */
  blockers: string[];
}

export function validateRows(rows: RawRow[], mapping: ColumnMapping[]): ValidationResult {
  const ctx = buildMappingContext(mapping, rows);
  const blockers: string[] = [];
  if (ctx.entities.length === 0) blockers.push("Map at least one column to a business field (for example Customer name).");
  if (ctx.entities.includes("transaction") && !ctx.byTarget.has("transaction.date"))
    blockers.push("Transactions need a date column. Map a column to “Transaction date”.");
  if (
    (ctx.entities.includes("customer") || ctx.entities.includes("lead")) &&
    !ctx.byTarget.has("customer.name") &&
    !(ctx.entities.includes("deal") && ctx.byTarget.has("customer.company"))
  )
    blockers.push("Map a column to “Customer name” so records can be linked to customers.");

  const seen = new Set<string>();
  const issueCounts: Partial<Record<IssueType, number>> = {};
  const rowIssues: RowIssue[] = [];
  const validRecords: CanonicalRecord[] = [];
  let duplicates = 0;

  rows.forEach((row, i) => {
    const { record, issues } = toCanonical(row, i, ctx);
    if (issues.length === 0) {
      const sig = recordSignature(record);
      if (seen.has(sig)) {
        duplicates++;
        issues.push("duplicate");
      } else {
        seen.add(sig);
        validRecords.push(record);
      }
    }
    if (issues.length) {
      rowIssues.push({ rowIndex: i, issues });
      for (const issue of issues) issueCounts[issue] = (issueCounts[issue] ?? 0) + 1;
    }
  });

  return {
    total: rows.length,
    valid: blockers.length ? 0 : validRecords.length,
    duplicates,
    issueCounts,
    rowIssues,
    validRecords: blockers.length ? [] : validRecords,
    entities: ctx.entities,
    blockers,
  };
}
