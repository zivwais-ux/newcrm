import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { DataCounts } from "@/types/domain";

// Thin typed wrappers over the analytics RPCs (supabase/migrations/*_analytics.sql).
// RPCs are SECURITY INVOKER, so RLS keeps every result inside the caller's org.

export class QueryError extends Error {}

async function rpc<T>(supabase: SupabaseClient, fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) {
    console.error(`[analytics] ${fn} failed`, error.message);
    throw new QueryError("We couldn't load this data right now.");
  }
  return data as T;
}

const num = (v: unknown) => Number(v ?? 0);

export interface RevenueSummary {
  from: string;
  to: string;
  compare_from: string;
  compare_to: string;
  total: number;
  compare_total: number;
  tx_count: number;
  compare_tx_count: number;
  customers: number;
  compare_customers: number;
  this_month: number;
  last_month: number;
  last_month_to_date: number;
  all_time: number;
  first_date: string | null;
  last_date: string | null;
}

export async function getDataCounts(supabase: SupabaseClient, org: string): Promise<DataCounts> {
  const d = await rpc<Record<string, number>>(supabase, "data_counts", { org });
  return {
    customers: num(d.customers),
    transactions: num(d.transactions),
    services: num(d.services),
    leads: num(d.leads),
    deals: num(d.deals),
    activities: num(d.activities),
    tasks: num(d.tasks),
  };
}

export async function getRevenueSummary(
  supabase: SupabaseClient,
  org: string,
  from: string,
  to: string,
  compare = "previous_period",
): Promise<RevenueSummary> {
  const d = await rpc<Record<string, unknown>>(supabase, "revenue_summary", { org, p_from: from, p_to: to, p_compare: compare });
  return {
    ...(d as unknown as RevenueSummary),
    total: num(d.total),
    compare_total: num(d.compare_total),
    tx_count: num(d.tx_count),
    compare_tx_count: num(d.compare_tx_count),
    customers: num(d.customers),
    compare_customers: num(d.compare_customers),
    this_month: num(d.this_month),
    last_month: num(d.last_month),
    last_month_to_date: num(d.last_month_to_date),
    all_time: num(d.all_time),
  };
}

export interface MonthPoint {
  month: string;
  revenue: number;
  tx_count: number;
  customers: number;
}

export async function getRevenueByMonth(supabase: SupabaseClient, org: string, from: string, to: string): Promise<MonthPoint[]> {
  const rows = await rpc<MonthPoint[]>(supabase, "revenue_by_month", { org, p_from: from, p_to: to });
  return (rows ?? []).map((r) => ({ month: r.month, revenue: num(r.revenue), tx_count: num(r.tx_count), customers: num(r.customers) }));
}

export interface ServiceRevenue {
  name: string;
  revenue: number;
  tx_count: number;
}

export async function getRevenueByService(supabase: SupabaseClient, org: string, from: string, to: string, limit = 8): Promise<ServiceRevenue[]> {
  const rows = await rpc<ServiceRevenue[]>(supabase, "revenue_by_service", { org, p_from: from, p_to: to, p_limit: limit });
  return (rows ?? []).map((r) => ({ name: r.name, revenue: num(r.revenue), tx_count: num(r.tx_count) }));
}

export interface RevenueBreakdown {
  current_total: number;
  previous_total: number;
  current_tx: number;
  previous_tx: number;
  current_customers: number;
  previous_customers: number;
  retained_customers: number;
  lost_customers: number;
  lost_customers_revenue: number;
  new_customers: number;
  new_customers_revenue: number;
  retained_revenue_change: number;
  services: { service: string; current: number; previous: number; change: number }[];
}

export async function getRevenueBreakdown(
  supabase: SupabaseClient,
  org: string,
  cur: { from: string; to: string },
  prev: { from: string; to: string },
): Promise<RevenueBreakdown> {
  const d = await rpc<Record<string, unknown>>(supabase, "revenue_change_breakdown", {
    org,
    cur_from: cur.from,
    cur_to: cur.to,
    prev_from: prev.from,
    prev_to: prev.to,
  });
  const out = {} as Record<string, unknown>;
  for (const [k, v] of Object.entries(d)) out[k] = k === "services" ? v : num(v);
  const services = ((d.services as RevenueBreakdown["services"]) ?? []).map((s) => ({
    service: s.service,
    current: num(s.current),
    previous: num(s.previous),
    change: num(s.change),
  }));
  return { ...(out as unknown as RevenueBreakdown), services };
}

export interface TopCustomer {
  id: string;
  name: string;
  email: string | null;
  revenue: number;
  purchases: number;
  last_purchase: string;
}

export async function getTopCustomers(supabase: SupabaseClient, org: string, from: string, to: string, limit = 10): Promise<TopCustomer[]> {
  const rows = await rpc<TopCustomer[]>(supabase, "top_customers", { org, p_from: from, p_to: to, p_limit: limit });
  return (rows ?? []).map((r) => ({ ...r, revenue: num(r.revenue), purchases: num(r.purchases) }));
}

export interface CustomerStats {
  total: number;
  new_30d: number;
  new_prev_30d: number;
  active: number;
  active_days: number;
}

export async function getCustomerStats(supabase: SupabaseClient, org: string, activeDays = 90): Promise<CustomerStats> {
  const d = await rpc<Record<string, unknown>>(supabase, "customer_stats", { org, active_days: activeDays });
  return {
    total: num(d.total),
    new_30d: num(d.new_30d),
    new_prev_30d: num(d.new_prev_30d),
    active: num(d.active),
    active_days: num(d.active_days),
  };
}

export interface RepeatStats {
  buyers: number;
  repeat: number;
  first_time: number;
  repeat_rate: number;
  overdue: number;
  avg_purchases_repeat: number;
}

export async function getRepeatStats(supabase: SupabaseClient, org: string, factor = 1.5): Promise<RepeatStats> {
  const d = await rpc<Record<string, unknown>>(supabase, "repeat_customer_stats", { org, overdue_factor: factor });
  return {
    buyers: num(d.buyers),
    repeat: num(d.repeat),
    first_time: num(d.first_time),
    repeat_rate: num(d.repeat_rate),
    overdue: num(d.overdue),
    avg_purchases_repeat: num(d.avg_purchases_repeat),
  };
}

export interface OverdueCustomer {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  purchases: number;
  total_revenue: number;
  avg_ticket: number;
  last_purchase: string;
  median_interval_days: number;
  days_since: number;
}

export async function getOverdueCustomers(supabase: SupabaseClient, org: string, factor = 1.5, limit = 50): Promise<OverdueCustomer[]> {
  const rows = await rpc<OverdueCustomer[]>(supabase, "overdue_customers", { org, overdue_factor: factor, p_limit: limit });
  return (rows ?? []).map((r) => ({
    ...r,
    purchases: num(r.purchases),
    total_revenue: num(r.total_revenue),
    avg_ticket: num(r.avg_ticket),
    median_interval_days: num(r.median_interval_days),
    days_since: num(r.days_since),
  }));
}

export interface RiskCustomer {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  recent_revenue: number;
  previous_revenue: number;
  change_pct: number | null;
  avg_ticket: number;
  total_revenue: number;
  purchases: number;
  last_activity: string | null;
  days_since: number;
  reason: "revenue_drop" | "inactive" | "revenue_drop_and_inactive";
}

export async function getCustomersAtRisk(
  supabase: SupabaseClient,
  org: string,
  inactiveDays = 60,
  dropPct = 30,
  limit = 50,
): Promise<RiskCustomer[]> {
  const rows = await rpc<RiskCustomer[]>(supabase, "customers_at_risk", {
    org,
    inactive_days: inactiveDays,
    drop_pct: dropPct,
    p_limit: limit,
  });
  return (rows ?? []).map((r) => ({
    ...r,
    recent_revenue: num(r.recent_revenue),
    previous_revenue: num(r.previous_revenue),
    change_pct: r.change_pct === null ? null : num(r.change_pct),
    avg_ticket: num(r.avg_ticket),
    total_revenue: num(r.total_revenue),
    purchases: num(r.purchases),
    days_since: num(r.days_since),
  }));
}

export interface RiskDeal {
  id: string;
  name: string;
  customer_id: string | null;
  customer_name: string | null;
  value: number;
  stage: string;
  owner_id: string | null;
  expected_close: string | null;
  last_activity: string;
  days_idle: number;
  reason: "past_close_date" | "no_recent_activity";
}

export async function getDealsAtRisk(supabase: SupabaseClient, org: string, idleDays = 14, limit = 50): Promise<RiskDeal[]> {
  const rows = await rpc<RiskDeal[]>(supabase, "deals_at_risk", { org, idle_days: idleDays, p_limit: limit });
  return (rows ?? []).map((r) => ({ ...r, value: num(r.value), days_idle: num(r.days_idle) }));
}

export interface StageSummary {
  stage: string;
  deals: number;
  value: number;
}

export async function getPipelineSummary(supabase: SupabaseClient, org: string): Promise<StageSummary[]> {
  const rows = await rpc<StageSummary[]>(supabase, "pipeline_summary", { org });
  return (rows ?? []).map((r) => ({ stage: r.stage, deals: num(r.deals), value: num(r.value) }));
}

export async function getCustomerRevenue(supabase: SupabaseClient, org: string, ids: string[]) {
  if (!ids.length) return new Map<string, { revenue: number; purchases: number; last_purchase: string }>();
  const rows = await rpc<{ customer_id: string; revenue: number; purchases: number; last_purchase: string }[]>(
    supabase,
    "customer_revenue",
    { org, ids },
  );
  return new Map((rows ?? []).map((r) => [r.customer_id, { revenue: num(r.revenue), purchases: num(r.purchases), last_purchase: r.last_purchase }]));
}

export interface LapsedCustomer {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  previous_revenue: number;
  last_purchase: string | null;
  lifetime_revenue: number;
}

export async function getLapsedCustomers(
  supabase: SupabaseClient,
  org: string,
  cur: { from: string; to: string },
  prev: { from: string; to: string },
  limit = 50,
): Promise<LapsedCustomer[]> {
  const rows = await rpc<LapsedCustomer[]>(supabase, "lapsed_customers", {
    org,
    cur_from: cur.from,
    cur_to: cur.to,
    prev_from: prev.from,
    prev_to: prev.to,
    p_limit: limit,
  });
  return (rows ?? []).map((r) => ({ ...r, previous_revenue: num(r.previous_revenue), lifetime_revenue: num(r.lifetime_revenue) }));
}
