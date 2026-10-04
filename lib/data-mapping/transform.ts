// Raw rows + confirmed mapping → canonical business records.
// This is the semantic layer: after this point nothing depends on spreadsheet column names.

import { CUSTOM, IGNORE, FIELD_BY_KEY, detectEntities, type ColumnMapping } from "./canonical-schema";
import {
  clean,
  inferDateOrder,
  nameKey,
  normalizeActivityType,
  normalizeCustomerStatus,
  normalizeEmail,
  normalizeLeadStatus,
  normalizeName,
  normalizePhone,
  normalizeStage,
  normalizeTxStatus,
  normalizeTxType,
  parseDate,
  parseMoney,
  type DateOrder,
} from "./values";
import type { RawRow } from "./heuristics";

export interface CustomerDraft {
  name: string;
  email: string | null;
  phone: string | null;
  company: string | null;
  status: string;
  custom_fields: Record<string, string>;
}

export interface TransactionDraft {
  date: string;
  amount: number;
  product_or_service: string | null;
  owner_name: string | null;
  status: string;
  type: string;
}

export interface LeadDraft {
  name: string;
  email: string | null;
  phone: string | null;
  source: string | null;
  status: string;
  value: number | null;
  custom_fields: Record<string, string>;
}

export interface DealDraft {
  name: string;
  stage: string;
  value: number;
  expected_close: string | null;
  owner_name: string | null;
}

export interface ActivityDraft {
  date: string;
  type: string;
  notes: string | null;
}

export interface CanonicalRecord {
  rowIndex: number;
  customer: CustomerDraft | null;
  transaction: TransactionDraft | null;
  lead: LeadDraft | null;
  deal: DealDraft | null;
  activity: ActivityDraft | null;
  serviceCategory: string | null;
}

export type IssueType =
  | "missing_customer_name"
  | "invalid_amount"
  | "invalid_date"
  | "missing_deal_name"
  | "duplicate";

export const ISSUE_LABELS: Record<IssueType, string> = {
  missing_customer_name: "Missing customer name",
  invalid_amount: "Missing or invalid amount",
  invalid_date: "Missing or invalid date",
  missing_deal_name: "Missing deal name",
  duplicate: "Duplicate row",
};

export interface MappingContext {
  byTarget: Map<string, string>; // canonical key → column
  customColumns: string[];
  entities: ReturnType<typeof detectEntities>;
  dateOrder: DateOrder;
}

export function buildMappingContext(mapping: ColumnMapping[], rows: RawRow[]): MappingContext {
  const byTarget = new Map<string, string>();
  const customColumns: string[] = [];
  for (const m of mapping) {
    if (m.target === IGNORE) continue;
    if (m.target === CUSTOM) customColumns.push(m.column);
    else if (FIELD_BY_KEY.has(m.target) && !byTarget.has(m.target)) byTarget.set(m.target, m.column);
  }
  const dateColumns = [...byTarget.entries()]
    .filter(([k]) => FIELD_BY_KEY.get(k)?.type === "date")
    .map(([, c]) => c);
  const dateSample = rows.slice(0, 500).flatMap((r) => dateColumns.map((c) => r[c]));
  return { byTarget, customColumns, entities: detectEntities(mapping), dateOrder: inferDateOrder(dateSample) };
}

/** Converts one raw row. Returns the canonical record and any blocking issues. */
export function toCanonical(row: RawRow, rowIndex: number, ctx: MappingContext): { record: CanonicalRecord; issues: IssueType[] } {
  const get = (key: string) => {
    const col = ctx.byTarget.get(key);
    return col === undefined ? undefined : row[col];
  };
  const text = (key: string) => {
    const v = normalizeName(get(key));
    return v || null;
  };
  const issues: IssueType[] = [];
  const custom: Record<string, string> = {};
  for (const col of ctx.customColumns) {
    const v = clean(row[col]);
    if (v) custom[col] = v;
  }

  const has = (e: string) => ctx.entities.includes(e as never);
  const name = text("customer.name");
  const email = normalizeEmail(get("customer.email"));
  const phone = normalizePhone(get("customer.phone"));
  const company = text("customer.company");

  const record: CanonicalRecord = {
    rowIndex,
    customer: null,
    transaction: null,
    lead: null,
    deal: null,
    activity: null,
    serviceCategory: text("service.category"),
  };

  if (has("lead")) {
    if (!name) issues.push("missing_customer_name");
    else
      record.lead = {
        name,
        email,
        phone,
        source: text("lead.source"),
        status: normalizeLeadStatus(get("lead.status")),
        value: parseMoney(get("lead.value")),
        custom_fields: { ...custom, ...(company ? { company } : {}) },
      };
  }

  if (has("customer")) {
    const customerName = name ?? (has("deal") ? company : null);
    if (!customerName) {
      if (!issues.includes("missing_customer_name")) issues.push("missing_customer_name");
    } else {
      record.customer = {
        name: customerName,
        email,
        phone,
        company,
        status: normalizeCustomerStatus(get("customer.status")),
        custom_fields: has("lead") ? {} : custom,
      };
    }
  }

  if (has("transaction")) {
    const amount = parseMoney(get("transaction.amount"));
    const date = parseDate(get("transaction.date"), ctx.dateOrder);
    if (amount === null) issues.push("invalid_amount");
    if (!date) issues.push("invalid_date");
    if (amount !== null && date) {
      record.transaction = {
        date,
        amount: Math.abs(amount),
        product_or_service: text("transaction.product_or_service"),
        owner_name: text("transaction.owner"),
        status: normalizeTxStatus(get("transaction.status")),
        type: amount < 0 ? "refund" : normalizeTxType(get("transaction.type")),
      };
    }
  }

  if (has("deal")) {
    const dealName = text("deal.name") ?? (company || name ? `${company ?? name} — deal` : null);
    if (!dealName) issues.push("missing_deal_name");
    else
      record.deal = {
        name: dealName,
        stage: normalizeStage(get("deal.stage")),
        value: Math.abs(parseMoney(get("deal.value")) ?? 0),
        expected_close: parseDate(get("deal.expected_close"), ctx.dateOrder),
        owner_name: text("transaction.owner"),
      };
  }

  if (has("activity")) {
    const date = parseDate(get("activity.date"), ctx.dateOrder) ?? (has("transaction") ? null : undefined);
    if (date === undefined) {
      if (!issues.includes("invalid_date")) issues.push("invalid_date");
    } else if (date) {
      record.activity = {
        date,
        type: normalizeActivityType(get("activity.type")),
        notes: text("activity.notes"),
      };
    }
  }

  return { record, issues };
}

/** Identity of a record for in-file duplicate detection. */
export function recordSignature(r: CanonicalRecord): string {
  const parts: unknown[] = [];
  const c = r.customer ?? r.lead;
  if (c) parts.push(c.email ?? c.phone ?? nameKey(c.name));
  if (r.transaction) parts.push(r.transaction.date, r.transaction.amount, r.transaction.product_or_service ?? "");
  if (r.deal) parts.push(r.deal.name.toLowerCase(), r.deal.value);
  if (r.activity) parts.push(r.activity.date, r.activity.type, r.activity.notes ?? "");
  return JSON.stringify(parts);
}

/**
 * Matches customers by email, then phone, then normalized name. Used for in-file
 * merging and for matching against existing database customers.
 */
export class CustomerResolver<T> {
  private byEmail = new Map<string, T>();
  private byPhone = new Map<string, T>();
  private byName = new Map<string, T>();

  find(c: { name: string; email: string | null; phone: string | null }): T | undefined {
    return (
      (c.email ? this.byEmail.get(c.email) : undefined) ??
      (c.phone ? this.byPhone.get(c.phone) : undefined) ??
      this.byName.get(nameKey(c.name))
    );
  }

  add(c: { name: string; email: string | null; phone: string | null }, value: T) {
    if (c.email && !this.byEmail.has(c.email)) this.byEmail.set(c.email, value);
    if (c.phone && !this.byPhone.has(c.phone)) this.byPhone.set(c.phone, value);
    const k = nameKey(c.name);
    if (k && !this.byName.has(k)) this.byName.set(k, value);
  }
}

export interface CanonicalBundle {
  customers: CustomerDraft[];
  services: { name: string; category: string | null; price: number | null }[];
  transactions: (TransactionDraft & { customerIndex: number | null })[];
  leads: LeadDraft[];
  deals: (DealDraft & { customerIndex: number | null })[];
  activities: (ActivityDraft & { customerIndex: number | null })[];
}

/** Groups canonical records into entity lists, merging repeated customers. */
export function buildBundle(records: CanonicalRecord[]): CanonicalBundle {
  const customers: CustomerDraft[] = [];
  const resolver = new CustomerResolver<number>();
  const services = new Map<string, { name: string; category: string | null; amounts: number[] }>();
  const bundle: CanonicalBundle = { customers, services: [], transactions: [], leads: [], deals: [], activities: [] };

  for (const r of records) {
    let customerIndex: number | null = null;
    if (r.customer) {
      const existing = resolver.find(r.customer);
      if (existing !== undefined) {
        customerIndex = existing;
        const c = customers[existing];
        c.email ??= r.customer.email;
        c.phone ??= r.customer.phone;
        c.company ??= r.customer.company;
        Object.assign(c.custom_fields, r.customer.custom_fields);
      } else {
        customerIndex = customers.push({ ...r.customer, custom_fields: { ...r.customer.custom_fields } }) - 1;
      }
      resolver.add(customers[customerIndex], customerIndex);
    }
    if (r.transaction) {
      bundle.transactions.push({ ...r.transaction, customerIndex });
      const svc = r.transaction.product_or_service;
      if (svc) {
        const key = svc.toLowerCase();
        const entry = services.get(key) ?? { name: svc, category: r.serviceCategory, amounts: [] };
        entry.amounts.push(r.transaction.amount);
        entry.category ??= r.serviceCategory;
        services.set(key, entry);
      }
    }
    if (r.lead) bundle.leads.push(r.lead);
    if (r.deal) bundle.deals.push({ ...r.deal, customerIndex });
    if (r.activity) bundle.activities.push({ ...r.activity, customerIndex });
  }

  bundle.services = [...services.values()].map((s) => ({ name: s.name, category: s.category, price: median(s.amounts) }));
  return bundle;
}

export function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}
