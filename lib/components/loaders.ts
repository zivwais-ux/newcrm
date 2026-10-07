import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { daysAgo } from "@/lib/utils";
import { israelDay, israelNow, israelToday, resolveRange, type RangePreset } from "@/lib/analytics/dates";
import {
  getCustomerRevenue,
  getCustomerStats,
  getCustomersAtRisk,
  getDealsAtRisk,
  getOneTimeCustomers,
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
import type { OutboxRow } from "@/lib/actions/automations";
import { loadStages } from "@/lib/stages";
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

/** Paid sales (newest first) → distinct customer ids, so lists can be ordered by last purchase. */
async function recentBuyerIds(ctx: LoaderContext, max: number) {
  const { data, error } = await ctx.supabase
    .from("transactions")
    .select("customer_id, date")
    .eq("organization_id", ctx.org.id)
    .eq("status", "paid")
    .neq("type", "refund")
    .not("customer_id", "is", null)
    .order("date", { ascending: false })
    .limit(max * 25);
  if (error) throw error;
  const ids: string[] = [];
  for (const r of data ?? []) {
    const id = r.customer_id as string;
    if (!ids.includes(id)) ids.push(id);
    if (ids.length >= max) break;
  }
  return ids;
}

const HUB_ROWS = 30;
const HUB_COLUMNS = "id, name, email, phone, company, status, created_at";

async function customerHub(ctx: LoaderContext, config: ComponentConfig) {
  const { supabase, org } = ctx;
  const activeDays = Number(config.activeDays ?? 90);
  const scope = await serviceScope(ctx);

  if (scope) {
    // Service-scoped: the customers who buy this service, most recent buyer first.
    const all = [...scope.values()].sort((a, b) => (b.last_purchase ?? "").localeCompare(a.last_purchase ?? ""));
    const top = all.slice(0, HUB_ROWS);
    let rows: { id: string; name: string; email: string | null; phone: string | null; company: string | null; status: string; created_at: string }[] = [];
    if (top.length) {
      const { data, error } = await supabase.from("customers").select(HUB_COLUMNS).eq("organization_id", org.id).in("id", top.map((t) => t.customer_id));
      if (error) throw error;
      rows = data ?? [];
    }
    const byId = new Map(rows.map((c) => [c.id, c]));
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
        .map((t) => ({ ...byId.get(t.customer_id)!, revenue: t.revenue, last_purchase: t.last_purchase as string | null })),
      // Lets "see all" links keep the service filter (the customers page accepts ?ids=).
      // Capped so the link stays under typical URL/header limits (~37 chars per id).
      scopeIds: all.slice(0, 300).map((r) => r.customer_id),
      scopedTo: filtersOf(ctx).service,
    };
  }

  const [stats, buyerIds] = await Promise.all([getCustomerStats(supabase, org.id, activeDays), recentBuyerIds(ctx, HUB_ROWS)]);
  let buyers: { id: string; name: string; email: string | null; phone: string | null; company: string | null; status: string; created_at: string }[] = [];
  if (buyerIds.length) {
    const { data, error } = await supabase.from("customers").select(HUB_COLUMNS).eq("organization_id", org.id).in("id", buyerIds);
    if (error) throw error;
    const byId = new Map((data ?? []).map((c) => [c.id, c]));
    buyers = buyerIds.flatMap((id) => (byId.has(id) ? [byId.get(id)!] : []));
  }
  // Not enough buyers yet → fill with the newest customers (no purchase yet).
  let fresh: typeof buyers = [];
  if (buyers.length < HUB_ROWS) {
    let q = supabase.from("customers").select(HUB_COLUMNS).eq("organization_id", org.id);
    if (buyers.length) q = q.not("id", "in", `(${buyers.map((b) => b.id).join(",")})`);
    const { data, error } = await q.order("created_at", { ascending: false }).limit(HUB_ROWS - buyers.length);
    if (error) throw error;
    fresh = data ?? [];
  }
  const rows = [...buyers, ...fresh];
  const revenue = await getCustomerRevenue(supabase, org.id, rows.map((r) => r.id));
  return {
    stats,
    customers: rows
      .map((r) => ({ ...r, revenue: revenue.get(r.id)?.revenue ?? 0, last_purchase: (revenue.get(r.id)?.last_purchase ?? null) as string | null }))
      // Most recent purchase first; customers who never bought go last (newest first, as fetched).
      .sort((a, b) => (b.last_purchase ?? "").localeCompare(a.last_purchase ?? "")),
    scopeIds: null as string[] | null,
    scopedTo: null as string | null,
  };
}
export type CustomerHubData = Awaited<ReturnType<typeof customerHub>>;

const SERVICE_ROWS = 8;

async function revenueIntelligence(ctx: LoaderContext, config: ComponentConfig) {
  const { supabase, org } = ctx;
  const f = filtersOf(ctx);
  // A workspace-wide date range overrides the Component's own setting.
  const preset = (f.range ?? config.range ?? "12m") as RangePreset;
  // Only "all time" needs the first sale date — skip that query otherwise.
  const firstDate = preset === "all" ? (await getRevenueSummary(supabase, org.id, "2000-01-01", israelToday())).first_date : null;
  const range = resolveRange(preset, israelNow(), firstDate);
  const [summary, monthly, services] = await Promise.all([
    getRevenueSummaryFiltered(supabase, org.id, range.from, range.to, config.compare ?? "previous_year", f.service),
    getRevenueByMonthFiltered(supabase, org.id, range.from, range.to, f.service),
    getRevenueByService(supabase, org.id, range.from, range.to, 500),
  ]);
  // Top services, and one "אחר" row for the rest so the list still adds up to the total.
  const byService = services.slice(0, SERVICE_ROWS).map((s) => ({ ...s, other: false }));
  const rest = services.slice(SERVICE_ROWS);
  if (rest.length)
    byService.push({
      name: `אחר (${rest.length})`,
      revenue: rest.reduce((sum, s) => sum + s.revenue, 0),
      tx_count: rest.reduce((sum, s) => sum + s.tx_count, 0),
      other: true,
    });
  return { summary, monthly, byService, range, rangePreset: preset, rangeFromWorkspace: Boolean(f.range), service: f.service, today: israelToday() };
}
export type RevenueData = Awaited<ReturnType<typeof revenueIntelligence>>;

async function repeatCustomers(ctx: LoaderContext, config: ComponentConfig) {
  const { supabase, org } = ctx;
  const factor = Number(config.factor ?? 1.5);
  const scope = await serviceScope(ctx);
  if (scope) {
    const rows = [...scope.values()];
    const repeaters = rows.filter((r) => r.purchases >= 2);
    const [overdueAll, oneTimeAll] = await Promise.all([
      getOverdueCustomers(supabase, org.id, factor, 500),
      getOneTimeCustomers(supabase, org.id, 30, 500),
    ]);
    // Overdue/one-time are judged on the customer's overall rhythm, restricted to buyers of this service.
    const overdue = overdueAll.filter((c) => scope.has(c.id));
    const oneTime = oneTimeAll.filter((c) => scope.has(c.id));
    return {
      stats: {
        buyers: rows.length,
        repeat: repeaters.length,
        first_time: rows.length - repeaters.length,
        repeat_rate: rows.length ? Math.round((1000 * repeaters.length) / rows.length) / 10 : 0,
        overdue: overdue.length,
        avg_purchases_repeat: repeaters.length ? Math.round((10 * repeaters.reduce((s, r) => s + r.purchases, 0)) / repeaters.length) / 10 : 0,
      },
      overdue: overdue.slice(0, 6),
      oneTime: oneTime.slice(0, 5),
      oneTimeTotal: oneTime.length,
      scopedTo: filtersOf(ctx).service,
    };
  }
  const [stats, overdue, oneTime] = await Promise.all([
    getRepeatStats(supabase, org.id, factor),
    getOverdueCustomers(supabase, org.id, factor, 6),
    getOneTimeCustomers(supabase, org.id, 30, 5),
  ]);
  return { stats, overdue, oneTime, oneTimeTotal: null as number | null, scopedTo: null as string | null };
}
export type RepeatData = Awaited<ReturnType<typeof repeatCustomers>>;

async function customerRisk(ctx: LoaderContext, config: ComponentConfig) {
  const scope = await serviceScope(ctx);
  // Config is validated by the registry (threshold 30/60/90, drop 20/30/50) and passed straight to the RPC.
  const threshold = Number(config.threshold ?? 60);
  const drop = Number(config.drop ?? 30);
  const all = await getCustomersAtRisk(ctx.supabase, ctx.org.id, threshold, drop, 500);
  const customers = scope ? all.filter((c) => scope.has(c.id)) : all;
  return { customers: customers.slice(0, 6), total: customers.length, ids: customers.map((c) => c.id), threshold, drop, scopedTo: filtersOf(ctx).service };
}
export type RiskData = Awaited<ReturnType<typeof customerRisk>>;

async function activities({ supabase, org }: LoaderContext, config: ComponentConfig) {
  const upcomingFirst = config.show === "upcoming";
  const showWhatsApp = config.whatsapp === "show";
  // Today (Israel) and later counts as "upcoming" — so this morning's appointments still show there.
  const day = israelDay();
  const base = () => {
    const q = supabase.from("activities").select("*, customers(name)").eq("organization_id", org.id);
    return showWhatsApp ? q : q.neq("type", "whatsapp");
  };
  const [upcoming, recent] = await Promise.all([
    base().gte("date", day.start).order("date", { ascending: true }).limit(upcomingFirst ? 8 : 3),
    base().lt("date", day.start).order("date", { ascending: false }).limit(upcomingFirst ? 3 : 8),
  ]);
  if (upcoming.error) throw upcoming.error;
  if (recent.error) throw recent.error;
  return { upcoming: (upcoming.data ?? []) as Activity[], recent: (recent.data ?? []) as Activity[], upcomingFirst, today: day.ymd };
}
export type ActivitiesData = Awaited<ReturnType<typeof activities>>;

/** Deals per stage shown on the canvas board (column counts/totals come from SQL, not from this list). */
const PIPELINE_PER_STAGE = 30;
const PIPELINE_FOCUSED_STAGE = 100;

async function salesPipeline(ctx: LoaderContext) {
  const { supabase, org } = ctx;
  const { stage } = filtersOf(ctx);
  // The business's own stages (order + names). A stage filter really narrows the deals that are loaded and shown.
  const stages = await loadStages(supabase, org.id);
  const shown = stage ? [stage] : stages.map((s) => s.key);
  const [summary, lists] = await Promise.all([
    getPipelineSummary(supabase, org.id),
    Promise.all(
      shown.map((s) =>
        supabase
          .from("deals")
          .select("*, customers(name, phone)")
          .eq("organization_id", org.id)
          .eq("stage", s)
          .order("value", { ascending: false })
          .order("id")
          .limit(stage ? PIPELINE_FOCUSED_STAGE : PIPELINE_PER_STAGE),
      ),
    ),
  ]);
  const deals: Deal[] = [];
  for (const r of lists) {
    if (r.error) throw r.error;
    deals.push(...((r.data ?? []) as Deal[]));
  }
  return { summary, deals, stage, stages, totalDeals: summary.reduce((s, x) => s + x.deals, 0) };
}
export type PipelineData = Awaited<ReturnType<typeof salesPipeline>>;

/** Ids of deals (from the given list) that already have an open task. */
async function dealsWithOpenTask(supabase: SupabaseClient, orgId: string, dealIds: string[]) {
  const out = new Set<string>();
  for (let i = 0; i < dealIds.length; i += 100) {
    const { data, error } = await supabase
      .from("tasks")
      .select("deal_id")
      .eq("organization_id", orgId)
      .eq("status", "open")
      .in("deal_id", dealIds.slice(i, i + 100));
    if (error) throw error;
    for (const t of data ?? []) if (t.deal_id) out.add(t.deal_id as string);
  }
  return out;
}

async function dealRisk(ctx: LoaderContext, config: ComponentConfig) {
  const { supabase, org } = ctx;
  const { stage } = filtersOf(ctx);
  const idleDays = Number(config.idleDays ?? 14);
  // The same threshold drives the RPC and every label in the view.
  const [all, stages] = await Promise.all([getDealsAtRisk(supabase, org.id, idleDays, 500), loadStages(supabase, org.id)]);
  const scoped = stage ? all.filter((d) => d.stage === stage) : all;
  const withTask = await dealsWithOpenTask(supabase, org.id, scoped.map((d) => d.id));
  const deals = scoped.map((d) => ({
    ...d,
    idle: d.days_idle >= idleDays,
    pastClose: Boolean(d.expected_close && d.expected_close < israelToday()),
    hasOpenTask: withTask.has(d.id),
  }));
  return {
    deals: deals.slice(0, 6),
    total: deals.length,
    totalValue: deals.reduce((s, d) => s + d.value, 0),
    /** Bulk "create tasks" targets only deals that don't already have an open task. */
    ids: deals.filter((d) => !d.hasOpenTask).map((d) => d.id),
    withTaskCount: withTask.size,
    idleDays,
    stage,
    /** The business's own stages, so the view can name them. */
    stages,
  };
}
export type DealRiskData = Awaited<ReturnType<typeof dealRisk>>;

async function followupRadar(ctx: LoaderContext, config: ComponentConfig) {
  const { supabase, org } = ctx;
  const { stage } = filtersOf(ctx);
  const today = israelToday();
  const idleDays = Number(config.idleDays ?? 14);
  const leadCutoff = new Date(Date.now() - Number(config.leadDays ?? 7) * 86_400_000).toISOString();
  const [tasks, atRisk, leads] = await Promise.all([
    supabase
      .from("tasks")
      .select("*, customers(name), deals(name)", { count: "exact" })
      .eq("organization_id", org.id)
      .eq("status", "open")
      .lt("due_date", today)
      .order("due_date")
      .limit(5),
    getDealsAtRisk(supabase, org.id, idleDays, 500),
    supabase
      .from("leads")
      .select("id, name, phone, source, status, created_at, updated_at", { count: "exact" })
      .eq("organization_id", org.id)
      .in("status", ["new", "contacted"])
      .lt("updated_at", leadCutoff)
      .order("updated_at")
      .limit(5),
  ]);
  if (tasks.error) throw tasks.error;
  if (leads.error) throw leads.error;
  // A deal can be both idle and past its close date — filter by days idle, not by reason.
  const quiet = atRisk.filter((d) => d.days_idle >= idleDays && (!stage || d.stage === stage));
  return {
    overdueTasks: (tasks.data ?? []) as Task[],
    overdueTaskCount: tasks.count ?? 0,
    quietDeals: quiet.slice(0, 5),
    quietDealCount: quiet.length,
    quietDealIds: quiet.map((d) => d.id),
    leads: (leads.data ?? []) as { id: string; name: string; phone: string | null; source: string | null; status: string; created_at: string; updated_at: string }[],
    leadCount: leads.count ?? 0,
    idleDays,
    stage,
  };
}
export type RadarData = Awaited<ReturnType<typeof followupRadar>>;

async function tasks(ctx: LoaderContext, config: ComponentConfig) {
  const { supabase, org, userId } = ctx;
  const today = israelToday();
  const mine = config.scope === "mine" && userId ? userId : null;
  let listQ = supabase
    .from("tasks")
    .select("*, customers(name), deals(name)", { count: "exact" })
    .eq("organization_id", org.id)
    .eq("status", "open");
  // Real overdue count from SQL — not limited by the 8 tasks shown.
  let overdueQ = supabase
    .from("tasks")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", org.id)
    .eq("status", "open")
    .lt("due_date", today);
  if (mine) {
    listQ = listQ.eq("assigned_to", mine);
    overdueQ = overdueQ.eq("assigned_to", mine);
  }
  const [list, overdue] = await Promise.all([
    listQ.order("due_date", { ascending: true, nullsFirst: false }).order("created_at", { ascending: false }).limit(8),
    overdueQ,
  ]);
  if (list.error) throw list.error;
  if (overdue.error) throw overdue.error;
  return { tasks: (list.data ?? []) as Task[], openCount: list.count ?? 0, overdueCount: overdue.count ?? 0, today };
}
export type TasksData = Awaited<ReturnType<typeof tasks>>;

type PersonRef = { name: string; phone: string | null } | null;

/** Activity types that count as a booked appointment (not calls, emails, notes or WhatsApp). */
const APPOINTMENT_TYPES = ["appointment", "meeting", "visit"];
/** Attendance marker on the first line of an appointment's notes (written by setAppointmentAttendance). */
const ATTENDANCE_MARK = /^\[(הגיע|לא הגיע)\][ \t]*\n?/;
/** Deals idle this many days show up under "עסקאות שנתקעו". */
const TODAY_STUCK_DAYS = 14;

function parseAttendance(notes: string | null) {
  const m = notes?.match(ATTENDANCE_MARK);
  if (!m || !notes) return { attendance: null as "arrived" | "no_show" | null, notes };
  return { attendance: (m[1] === "הגיע" ? "arrived" : "no_show") as "arrived" | "no_show", notes: notes.slice(m[0].length).trim() || null };
}

/**
 * Messages flows prepared and that wait for one tap (same query as listOutbox, oldest first).
 * Never throws: a failure here must not take down the module that shows it.
 */
export async function loadPendingOutbox(supabase: SupabaseClient, orgId: string, limit = 30) {
  const { data, count, error } = await supabase
    .from("outbox_messages")
    .select("id, customer_id, lead_id, name, phone, body, automation_id, created_at", { count: "exact" })
    .eq("organization_id", orgId)
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(Math.min(Math.max(limit, 1), 100));
  if (error) {
    console.error("[outbox]", error);
    return { rows: [] as OutboxRow[], total: 0 };
  }
  return { rows: (data ?? []) as OutboxRow[], total: count ?? data?.length ?? 0 };
}

async function today(ctx: LoaderContext, config: ComponentConfig) {
  const { supabase, org } = ctx;
  const day = israelDay();
  // Noon of the next Israel day — DST-safe way to get tomorrow's bounds.
  const tomorrow = israelDay(new Date(new Date(day.end).getTime() + 12 * 3_600_000));
  const scope = await serviceScope(ctx);
  const [appointments, upcoming, tasks, overdue, deals, pendingOutbox] = await Promise.all([
    supabase
      .from("activities")
      .select("id, type, date, notes, customer_id, customers(name, phone)")
      .eq("organization_id", org.id)
      .gte("date", day.start)
      .lt("date", day.end)
      .in("type", APPOINTMENT_TYPES)
      .order("date")
      .limit(20),
    supabase
      .from("activities")
      .select("id, type, date, notes, customer_id, customers(name, phone)")
      .eq("organization_id", org.id)
      .gte("date", tomorrow.start)
      .lt("date", tomorrow.end)
      .in("type", APPOINTMENT_TYPES)
      .order("date")
      .limit(20),
    supabase
      .from("tasks")
      .select("id, title, due_date, status, customer_id, deal_id, assigned_to, customers(name, phone)", { count: "exact" })
      .eq("organization_id", org.id)
      .eq("status", "open")
      .lte("due_date", day.ymd)
      .order("due_date")
      .limit(8),
    getOverdueCustomers(supabase, org.id, Number(config.factor ?? 1.5), scope ? 200 : 20),
    getDealsAtRisk(supabase, org.id, TODAY_STUCK_DAYS, 50),
    loadPendingOutbox(supabase, org.id, 5),
  ]);
  if (appointments.error) throw appointments.error;
  if (upcoming.error) throw upcoming.error;
  if (tasks.error) throw tasks.error;

  const comeBack = (scope ? overdue.filter((c) => scope.has(c.id)) : overdue).slice(0, 5);
  const stuck = deals.filter((d) => d.days_idle >= TODAY_STUCK_DAYS).slice(0, 4);
  const dealCustomerIds = [...new Set(stuck.map((d) => d.customer_id).filter((id): id is string => !!id))];
  const tomorrowCustomerIds = [...new Set((upcoming.data ?? []).map((a) => a.customer_id as string | null).filter((id): id is string => !!id))];
  const [phones, sentToday] = await Promise.all([
    dealCustomerIds.length
      ? supabase.from("customers").select("id, phone").eq("organization_id", org.id).in("id", dealCustomerIds)
      : Promise.resolve({ data: [] as { id: string; phone: string | null }[], error: null }),
    // Who already got a WhatsApp today — so tomorrow's reminders show as sent.
    tomorrowCustomerIds.length
      ? supabase
          .from("activities")
          .select("customer_id")
          .eq("organization_id", org.id)
          .eq("type", "whatsapp")
          .gte("date", day.start)
          .in("customer_id", tomorrowCustomerIds)
      : Promise.resolve({ data: [] as { customer_id: string | null }[], error: null }),
  ]);
  if (phones.error) throw phones.error;
  if (sentToday.error) throw sentToday.error;
  const phoneById = new Map((phones.data ?? []).map((c) => [c.id as string, c.phone as string | null]));
  const sent = new Set((sentToday.data ?? []).map((a) => a.customer_id as string | null).filter(Boolean));
  const one = (v: unknown) => (Array.isArray(v) ? v[0] : v) as PersonRef;
  const now = Date.now();

  return {
    today: day.ymd,
    tomorrow: tomorrow.ymd,
    appointments: (appointments.data ?? []).map((a) => {
      const { attendance, notes } = parseAttendance(a.notes as string | null);
      return {
        id: a.id as string,
        type: a.type as string,
        date: a.date as string,
        notes,
        attendance,
        past: new Date(a.date as string).getTime() <= now,
        customer_id: a.customer_id as string | null,
        customer: one(a.customers),
      };
    }),
    reminders: (upcoming.data ?? []).map((a) => ({
      id: a.id as string,
      type: a.type as string,
      date: a.date as string,
      notes: parseAttendance(a.notes as string | null).notes,
      customer_id: a.customer_id as string | null,
      customer: one(a.customers),
      sent: Boolean(a.customer_id && sent.has(a.customer_id as string)),
    })),
    tasks: (tasks.data ?? []).map((t) => ({ id: t.id as string, title: t.title as string, due_date: t.due_date as string | null, customer_id: t.customer_id as string | null, customer: one(t.customers) })),
    taskCount: tasks.count ?? 0,
    comeBack,
    stuck: stuck.map((d) => ({ ...d, phone: d.customer_id ? phoneById.get(d.customer_id) ?? null : null })),
    scopedTo: filtersOf(ctx).service,
    outbox: pendingOutbox.rows,
    outboxCount: pendingOutbox.total,
  };
}
export type TodayData = Awaited<ReturnType<typeof today>>;

async function outbox(ctx: LoaderContext) {
  return loadPendingOutbox(ctx.supabase, ctx.org.id, 30);
}
export type OutboxData = Awaited<ReturnType<typeof outbox>>;

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
  outbox,
};
