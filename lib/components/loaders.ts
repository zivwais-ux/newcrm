import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { daysAgo } from "@/lib/utils";
import { israelDay, israelNow, israelToday, resolveRange, type RangePreset } from "@/lib/analytics/dates";
import {
  getCustomerRevenue,
  getCustomerStats,
  getCustomersAtRisk,
  getDealsAtRisk,
  getOverdueCustomers,
  getPipelineSummary,
  getRepeatStats,
  getRevenueByMonthFiltered,
  getRevenueByService,
  getRevenueSummary,
  getRevenueSummaryFiltered,
  getServiceCustomers,
} from "@/lib/analytics/queries";
import type { Activity, Deal, Task } from "@/types/domain";
import { EMPTY_FILTERS, type WorkspaceFilters } from "./filters";
import type { ComponentConfig } from "./types";

// Server-side data loaders, one per Component id. Each reads only canonical
// tables/RPCs through the user-scoped client, applies the shared workspace
// filters it consumes, and returns serializable data.

export interface LoaderContext {
  supabase: SupabaseClient;
  org: { id: string; currency: string; business_type: string };
  userId?: string;
  filters?: WorkspaceFilters;
}

type Loader = (ctx: LoaderContext, config: ComponentConfig) => Promise<unknown>;

const filtersOf = (ctx: LoaderContext) => ctx.filters ?? EMPTY_FILTERS;

/** Customer ids that bought the filtered service (null = no service filter). */
async function serviceScope(ctx: LoaderContext) {
  const { service } = filtersOf(ctx);
  if (!service) return null;
  const rows = await getServiceCustomers(ctx.supabase, ctx.org.id, service);
  return new Map(rows.map((r) => [r.customer_id, r]));
}

async function customerHub(ctx: LoaderContext, config: ComponentConfig) {
  const { supabase, org } = ctx;
  const activeDays = Number(config.activeDays ?? 90);
  const scope = await serviceScope(ctx);

  if (scope) {
    // Service-scoped: the customers who buy this service, ranked by what they spend on it.
    const all = [...scope.values()];
    const top = all.sort((a, b) => b.revenue - a.revenue).slice(0, 8);
    const { data } = top.length
      ? await supabase.from("customers").select("id, name, email, company, status, created_at").in("id", top.map((t) => t.customer_id))
      : { data: [] };
    const byId = new Map((data ?? []).map((c) => [c.id, c]));
    return {
      stats: {
        total: all.length,
        new_30d: all.filter((r) => (daysAgo(r.first_purchase) ?? 999) <= 30).length,
        new_prev_30d: all.filter((r) => {
          const d = daysAgo(r.first_purchase) ?? 999;
          return d > 30 && d <= 60;
        }).length,
        active: all.filter((r) => (daysAgo(r.last_purchase) ?? 999) <= activeDays).length,
        active_days: activeDays,
      },
      customers: top
        .filter((t) => byId.has(t.customer_id))
        .map((t) => ({ ...byId.get(t.customer_id)!, revenue: t.revenue, last_purchase: t.last_purchase })),
      scopedTo: filtersOf(ctx).service,
    };
  }

  const [stats, recent] = await Promise.all([
    getCustomerStats(supabase, org.id, activeDays),
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
    scopedTo: null as string | null,
  };
}
export type CustomerHubData = Awaited<ReturnType<typeof customerHub>>;

async function revenueIntelligence(ctx: LoaderContext, config: ComponentConfig) {
  const { supabase, org } = ctx;
  const f = filtersOf(ctx);
  const all = await getRevenueSummary(supabase, org.id, "2000-01-01", israelToday());
  // A workspace-wide date range overrides the Component's own setting.
  const preset = (f.range ?? config.range ?? "12m") as RangePreset;
  const range = resolveRange(preset, israelNow(), all.first_date);
  const [summary, monthly, byService] = await Promise.all([
    getRevenueSummaryFiltered(supabase, org.id, range.from, range.to, config.compare ?? "previous_year", f.service),
    getRevenueByMonthFiltered(supabase, org.id, range.from, range.to, f.service),
    getRevenueByService(supabase, org.id, range.from, range.to, 8),
  ]);
  return { summary, monthly, byService, range, rangePreset: preset, rangeFromWorkspace: Boolean(f.range), service: f.service };
}
export type RevenueData = Awaited<ReturnType<typeof revenueIntelligence>>;

async function repeatCustomers(ctx: LoaderContext, config: ComponentConfig) {
  const { supabase, org } = ctx;
  const factor = Number(config.factor ?? 1.5);
  const scope = await serviceScope(ctx);
  if (scope) {
    const rows = [...scope.values()];
    const repeat = rows.filter((r) => r.purchases >= 2).length;
    const overdueAll = await getOverdueCustomers(supabase, org.id, factor, 500);
    const overdue = overdueAll.filter((c) => scope.has(c.id));
    return {
      stats: {
        buyers: rows.length,
        repeat,
        first_time: rows.length - repeat,
        repeat_rate: rows.length ? Math.round((1000 * repeat) / rows.length) / 10 : 0,
        overdue: overdue.length,
        avg_purchases_repeat: 0,
      },
      overdue: overdue.slice(0, 6),
      scopedTo: filtersOf(ctx).service,
    };
  }
  const [stats, overdue] = await Promise.all([getRepeatStats(supabase, org.id, factor), getOverdueCustomers(supabase, org.id, factor, 6)]);
  return { stats, overdue, scopedTo: null as string | null };
}
export type RepeatData = Awaited<ReturnType<typeof repeatCustomers>>;

async function customerRisk(ctx: LoaderContext, config: ComponentConfig) {
  const scope = await serviceScope(ctx);
  const all = await getCustomersAtRisk(ctx.supabase, ctx.org.id, Number(config.threshold ?? 60), Number(config.drop ?? 30), scope ? 500 : 50);
  const customers = scope ? all.filter((c) => scope.has(c.id)) : all;
  return { customers: customers.slice(0, 6), total: customers.length, ids: customers.map((c) => c.id), scopedTo: filtersOf(ctx).service };
}
export type RiskData = Awaited<ReturnType<typeof customerRisk>>;

async function activities({ supabase, org }: LoaderContext, config: ComponentConfig) {
  const upcomingFirst = config.show === "upcoming";
  const now = new Date().toISOString();
  const base = () => supabase.from("activities").select("*, customers(name)").eq("organization_id", org.id);
  const [upcoming, recent] = await Promise.all([
    base().gte("date", now).order("date", { ascending: true }).limit(upcomingFirst ? 8 : 3),
    base().lt("date", now).order("date", { ascending: false }).limit(upcomingFirst ? 3 : 8),
  ]);
  return { upcoming: (upcoming.data ?? []) as Activity[], recent: (recent.data ?? []) as Activity[], upcomingFirst };
}
export type ActivitiesData = Awaited<ReturnType<typeof activities>>;

async function salesPipeline(ctx: LoaderContext) {
  const { supabase, org } = ctx;
  const [summary, deals] = await Promise.all([
    getPipelineSummary(supabase, org.id),
    supabase.from("deals").select("*, customers(name)").eq("organization_id", org.id).order("value", { ascending: false }).limit(200),
  ]);
  return { summary, deals: (deals.data ?? []) as Deal[], stage: filtersOf(ctx).stage };
}
export type PipelineData = Awaited<ReturnType<typeof salesPipeline>>;

async function dealRisk(ctx: LoaderContext, config: ComponentConfig) {
  const { stage } = filtersOf(ctx);
  const all = await getDealsAtRisk(ctx.supabase, ctx.org.id, Number(config.idleDays ?? 14), 200);
  const deals = stage ? all.filter((d) => d.stage === stage) : all;
  return {
    deals: deals.slice(0, 6),
    total: deals.length,
    totalValue: deals.reduce((s, d) => s + d.value, 0),
    ids: deals.map((d) => d.id),
    stage,
  };
}
export type DealRiskData = Awaited<ReturnType<typeof dealRisk>>;

async function followupRadar(ctx: LoaderContext, config: ComponentConfig) {
  const { supabase, org } = ctx;
  const { stage } = filtersOf(ctx);
  const today = israelToday();
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
    getDealsAtRisk(supabase, org.id, 10, 200),
    supabase
      .from("leads")
      .select("id, name, source, status, created_at, updated_at", { count: "exact" })
      .eq("organization_id", org.id)
      .in("status", ["new", "contacted"])
      .lt("updated_at", leadCutoff)
      .order("updated_at")
      .limit(5),
  ]);
  const noActivity = quietDeals.filter((d) => d.reason === "no_recent_activity" && (!stage || d.stage === stage));
  return {
    overdueTasks: (tasks.data ?? []) as Task[],
    overdueTaskCount: tasks.count ?? 0,
    quietDeals: noActivity.slice(0, 5),
    quietDealCount: noActivity.length,
    quietDealIds: noActivity.map((d) => d.id),
    leads: leads.data ?? [],
    leadCount: leads.count ?? 0,
    stage,
  };
}
export type RadarData = Awaited<ReturnType<typeof followupRadar>>;

async function tasks(ctx: LoaderContext, config: ComponentConfig) {
  const { supabase, org, userId } = ctx;
  let q = supabase
    .from("tasks")
    .select("*, customers(name), deals(name)", { count: "exact" })
    .eq("organization_id", org.id)
    .eq("status", "open");
  if (config.scope === "mine" && userId) q = q.eq("assigned_to", userId);
  const { data, count } = await q.order("due_date", { ascending: true, nullsFirst: false }).order("created_at", { ascending: false }).limit(8);
  const today = israelToday();
  const list = (data ?? []) as Task[];
  return { tasks: list, openCount: count ?? 0, overdueCount: list.filter((t) => t.due_date && t.due_date < today).length };
}
export type TasksData = Awaited<ReturnType<typeof tasks>>;

type PersonRef = { name: string; phone: string | null } | null;

async function today(ctx: LoaderContext, config: ComponentConfig) {
  const { supabase, org } = ctx;
  const day = israelDay();
  const scope = await serviceScope(ctx);
  const [appointments, tasks, overdue, deals] = await Promise.all([
    supabase
      .from("activities")
      .select("id, type, date, notes, customer_id, customers(name, phone)")
      .eq("organization_id", org.id)
      .gte("date", day.start)
      .lt("date", day.end)
      .neq("type", "whatsapp")
      .order("date")
      .limit(12),
    supabase
      .from("tasks")
      .select("id, title, due_date, status, customer_id, deal_id, assigned_to, customers(name, phone)", { count: "exact" })
      .eq("organization_id", org.id)
      .eq("status", "open")
      .lte("due_date", day.ymd)
      .order("due_date")
      .limit(8),
    getOverdueCustomers(supabase, org.id, Number(config.factor ?? 1.5), scope ? 200 : 20),
    getDealsAtRisk(supabase, org.id, 14, 20),
  ]);
  const comeBack = (scope ? overdue.filter((c) => scope.has(c.id)) : overdue).slice(0, 5);
  const stuck = deals.filter((d) => d.reason === "no_recent_activity").slice(0, 4);
  const dealCustomerIds = [...new Set(stuck.map((d) => d.customer_id).filter((id): id is string => !!id))];
  const { data: phones } = dealCustomerIds.length
    ? await supabase.from("customers").select("id, phone").in("id", dealCustomerIds)
    : { data: [] as { id: string; phone: string | null }[] };
  const phoneById = new Map((phones ?? []).map((c) => [c.id, c.phone]));
  const one = (v: unknown) => (Array.isArray(v) ? v[0] : v) as PersonRef;

  return {
    today: day.ymd,
    appointments: (appointments.data ?? []).map((a) => ({ id: a.id, type: a.type as string, date: a.date as string, notes: a.notes as string | null, customer_id: a.customer_id as string | null, customer: one(a.customers) })),
    tasks: (tasks.data ?? []).map((t) => ({ id: t.id, title: t.title as string, due_date: t.due_date as string | null, customer_id: t.customer_id as string | null, customer: one(t.customers) })),
    taskCount: tasks.count ?? 0,
    comeBack,
    stuck: stuck.map((d) => ({ ...d, phone: d.customer_id ? phoneById.get(d.customer_id) ?? null : null })),
    scopedTo: filtersOf(ctx).service,
  };
}
export type TodayData = Awaited<ReturnType<typeof today>>;

async function aiAnalyst(ctx: LoaderContext) {
  return { filters: filtersOf(ctx) };
}
export type AIAnalystData = Awaited<ReturnType<typeof aiAnalyst>>;

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
  tasks,
  today,
};
