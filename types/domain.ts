// Canonical business entities. These mirror supabase/migrations and are the
// only shapes Components depend on — never raw spreadsheet columns.

export type BusinessType = "service" | "sales" | "both";
export type MemberRole = "owner" | "admin" | "member";

export interface Organization {
  id: string;
  name: string;
  business_type: BusinessType;
  data_source_pref: string | null;
  currency: string;
  onboarding_completed: boolean;
  created_at: string;
}

export interface Customer {
  id: string;
  organization_id: string;
  name: string;
  email: string | null;
  phone: string | null;
  company: string | null;
  status: "active" | "inactive" | "lead" | "churned";
  owner_id: string | null;
  custom_fields: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface Lead {
  id: string;
  organization_id: string;
  customer_id: string | null;
  name: string;
  email: string | null;
  phone: string | null;
  source: string | null;
  status: "new" | "contacted" | "qualified" | "converted" | "lost";
  owner_id: string | null;
  value: number | null;
  custom_fields: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export const DEAL_STAGES = ["new", "contacted", "qualified", "proposal", "negotiation", "won", "lost"] as const;
export type DealStage = (typeof DEAL_STAGES)[number];

export interface Deal {
  id: string;
  organization_id: string;
  customer_id: string | null;
  name: string;
  stage: DealStage;
  value: number;
  owner_id: string | null;
  expected_close: string | null;
  last_activity_at: string;
  custom_fields: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  customers?: { name: string } | null;
}

export interface Transaction {
  id: string;
  organization_id: string;
  customer_id: string | null;
  service_id: string | null;
  amount: number;
  type: "sale" | "refund" | "subscription" | "other";
  date: string;
  product_or_service: string | null;
  status: "paid" | "pending" | "cancelled" | "refunded";
  owner_id: string | null;
  owner_name: string | null;
  created_at: string;
  customers?: { name: string } | null;
}

export const ACTIVITY_TYPES = ["appointment", "call", "meeting", "email", "note", "visit"] as const;
export type ActivityType = (typeof ACTIVITY_TYPES)[number];

export interface Activity {
  id: string;
  organization_id: string;
  customer_id: string | null;
  deal_id: string | null;
  type: ActivityType;
  date: string;
  owner_id: string | null;
  notes: string | null;
  created_at: string;
  customers?: { name: string } | null;
}

export interface Task {
  id: string;
  organization_id: string;
  title: string;
  description: string | null;
  assigned_to: string | null;
  customer_id: string | null;
  deal_id: string | null;
  status: "open" | "done";
  due_date: string | null;
  created_at: string;
  customers?: { name: string } | null;
  deals?: { name: string } | null;
}

export interface Service {
  id: string;
  organization_id: string;
  name: string;
  category: string | null;
  price: number | null;
  created_at: string;
}

export interface InstalledComponent {
  id: string;
  organization_id: string;
  component_type: string;
  name: string;
  config: Record<string, unknown>;
  position: number;
  created_at: string;
  updated_at: string;
}

export interface Member {
  user_id: string;
  role: MemberRole;
  full_name: string | null;
}

export type EntityName = "customers" | "transactions" | "services" | "leads" | "deals" | "activities" | "tasks";
export type DataCounts = Record<EntityName, number>;

/** Uniform result for server actions — never leaks raw errors to the UI. */
export type ActionResult<T = undefined> = { ok: true; data: T } | { ok: false; error: string };
