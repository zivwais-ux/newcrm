import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isoDate } from "@/lib/utils";
import { resolveRange, type RangePreset } from "@/lib/analytics/dates";
import {
  getCustomerRevenue,
  getCustomerStats,
  getCustomersAtRisk,
  getDealsAtRisk,
  getOverdueCustomers,
  getPipelineSummary,
  getRepeatStats,
  getRevenueByMonth,
  getRevenueByService,
  getRevenueSummary,
} from "@/lib/analytics/queries";
import type { Activity, Deal, Task } from "@/types/domain";
import type { ComponentConfig } from "./types";

// Server-side data loaders, one per Component id. Each reads only canonical
// tables/RPCs through the user-scoped client, and returns serializable data.

export interface LoaderContext {
  supabase: SupabaseClient;
  org: { id: string; currency: string; business_type: string };
}

type Loader = (ctx: LoaderContext, config: ComponentConfig) => Promise<unknown>;

async function customerHub({ supabase, org }: LoaderContext, config: ComponentConfig) {
  const [stats, recent] = await Promise.all([
    getCustomerStats(supabase, org.id, Number(config.activeDays ?? 90)),
    supabase
      .from("customers")
      .select("id, name, email, company, status, created_at")
      .eq("organization_id", org.id)
      .order("created_at", { ascending: false })
      .limit(8),
  ]);
  const rows = recent.data ?? [];
  const revenue = await getCustomerRevenue(supabase, org.id, rows.map((r) => r.id));
  return {
    stats,
    customers: rows.map((r) => ({ ...r, revenue: revenue.get(r.id)?.revenue ?? 0, last_purchase: revenue.get(r.id)?.last_purchase ?? null })),
  };
}
export type CustomerHubData = Awaited<ReturnType<typeof customerHub>>;

async function revenueIntelligence({ supabase, org }: LoaderContext, config: ComponentConfig) {
  const all = await getRevenueSummary(supabase, org.id, "2000-01-01", isoDate(new Date()));
  const range = resolveRange((config.range as RangePreset) ?? "12m", new Date(), all.first_date);
  const [summary, monthly, byService] = await Promise.all([
    getRevenueSummary(supabase, org.id, range.from, range.to, config.compare ?? "previous_year"),
    getRevenueByMonth(supabase, org.id, range.from, range.to),
    getRevenueByService(supabase, org.id, range.from, range.to, 8),
  ]);
  return { summary, monthly, byService, range };
}
export type RevenueData = Awaited<ReturnType<typeof revenueIntelligence>>;

async function repeatCustomers({ supabase, org }: LoaderContext, config: ComponentConfig) {
  const factor = Number(config.factor ?? 1.5);
  const [stats, overdue] = await Promise.all([getRepeatStats(supabase, org.id, factor), getOverdueCustomers(supabase, org.id, factor, 6)]);
  return { stats, overdue };
}
export type RepeatData = Awaited<ReturnType<typeof repeatCustomers>>;

async function customerRisk({ supabase, org }: LoaderContext, config: ComponentConfig) {
  const customers = await getCustomersAtRisk(supabase, org.id, Number(config.threshold ?? 60), Number(config.drop ?? 30), 50);
  return { customers: customers.slice(0, 6), total: customers.length, ids: customers.map((c) => c.id) };
}
export type RiskData = Awaited<ReturnType<typeof customerRisk>>;

async function activities({ supabase, org }: LoaderContext, config: ComponentConfig) {
  const upcomingFirst = config.show === "upcoming";
  const now = new Date().toISOString();
  const base = () =>
    supabase.from("activities").select("*, customers(name)").eq("organization_id", org.id);
  const [upcoming, recent] = await Promise.all([
    base().gte("date", now).order("date", { ascending: true }).limit(upcomingFirst ? 8 : 3),
    base().lt("date", now).order("date", { ascending: false }).limit(upcomingFirst ? 3 : 8),
  ]);
  return { upcoming: (upcoming.data ?? []) as Activity[], recent: (recent.data ?? []) as Activity[], upcomingFirst };
}
export type ActivitiesData = Awaited<ReturnType<typeof activities>>;

async function salesPipeline({ supabase, org }: LoaderContext) {
  const [summary, deals] = await Promise.all([
    getPipelineSummary(supabase, org.id),
    supabase
      .from("deals")
      .select("*, customers(name)")
      .eq("organization_id", org.id)
      .order("value", { ascending: false })
      .limit(200),
  ]);
  return { summary, deals: (deals.data ?? []) as Deal[] };
}
export type PipelineData = Awaited<ReturnType<typeof salesPipeline>>;

async function dealRisk({ supabase, org }: LoaderContext, config: ComponentConfig) {
  const deals = await getDealsAtRisk(supabase, org.id, Number(config.idleDays ?? 14), 50);
  return { deals: deals.slice(0, 6), total: deals.length, totalValue: deals.reduce((s, d) => s + d.value, 0), ids: deals.map((d) => d.id) };
}
export type DealRiskData = Awaited<ReturnType<typeof dealRisk>>;

async function followupRadar({ supabase, org }: LoaderContext, config: ComponentConfig) {
  const today = isoDate(new Date());
  const leadCutoff = new Date(Date.now() - Number(config.leadDays ?? 7) * 86_400_000).toISOString();
  const [tasks, quietDeals, leads] = await Promise.all([
    supabase
      .from("tasks")
      .select("*, customers(name), deals(name)", { count: "exact" })
      .eq("organization_id", org.id)
      .eq("status", "open")
      .lt("due_date", today)
      .order("due_date")
      .limit(5),
    getDealsAtRisk(supabase, org.id, 10, 50),
    supabase
      .from("leads")
      .select("id, name, source, status, created_at, updated_at", { count: "exact" })
      .eq("organization_id", org.id)
      .in("status", ["new", "contacted"])
      .lt("updated_at", leadCutoff)
      .order("updated_at")
      .limit(5),
  ]);
  const noActivity = quietDeals.filter((d) => d.reason === "no_recent_activity");
  return {
    overdueTasks: (tasks.data ?? []) as Task[],
    overdueTaskCount: tasks.count ?? 0,
    quietDeals: noActivity.slice(0, 5),
    quietDealCount: noActivity.length,
    quietDealIds: noActivity.map((d) => d.id),
    leads: leads.data ?? [],
    leadCount: leads.count ?? 0,
  };
}
export type RadarData = Awaited<ReturnType<typeof followupRadar>>;

async function aiAnalyst() {
  return {};
}

/** Loader registry — keyed by Component id (see lib/components/registry.ts). */
export const COMPONENT_LOADERS: Record<string, Loader> = {
  "customer-hub": customerHub,
  "revenue-intelligence": revenueIntelligence,
  "ai-analyst": aiAnalyst,
  "repeat-customers": repeatCustomers,
  "customer-risk": customerRisk,
  activities,
  "sales-pipeline": salesPipeline,
  "deal-risk": dealRisk,
  "followup-radar": followupRadar,
};
