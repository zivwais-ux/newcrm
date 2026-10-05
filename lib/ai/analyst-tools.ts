import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ChatCompletionFunctionTool } from "openai/resources/chat/completions";
import {
  getCustomerStats,
  getCustomersAtRisk,
  getDataCounts,
  getDealsAtRisk,
  getLapsedCustomers,
  getOverdueCustomers,
  getPipelineSummary,
  getRevenueBreakdown,
  getRevenueByMonth,
  getRevenueByService,
  getRevenueSummary,
  getTopCustomers,
} from "@/lib/analytics/queries";
import { resolveRange } from "@/lib/analytics/dates";
import { STAGE_NAMES } from "@/lib/components/filters";
import type { DealStage } from "@/types/domain";

// Read-only analytics tools available to the AI Business Analyst.
// They run server-side through the user-scoped client: RLS confines them to the
// user's organization. No tool writes data and the model never writes SQL.

export interface AnalystAction {
  type: "view_customers" | "create_tasks";
  label: string;
  customerIds?: string[];
  dealIds?: string[];
  title?: string;
  taskTitle?: string;
}

export interface ToolContext {
  supabase: SupabaseClient;
  orgId: string;
  currency: string;
  /** Actions derived from tool results (never chosen freely by the model). */
  actions: AnalystAction[];
  toolsUsed: string[];
}

const dateParam = { type: "string", description: "ISO date yyyy-mm-dd" };

export const ANALYST_TOOLS: ChatCompletionFunctionTool[] = [
  {
    type: "function",
    function: {
      name: "get_business_overview",
      description: "Counts of customers, transactions, deals etc., revenue for the last 12 months and customer activity. Call first for broad questions.",
      parameters: { type: "object", properties: {}, additionalProperties: false },
    },
  },
  {
    type: "function",
    function: {
      name: "compare_periods",
      description:
        "Explains a revenue change between two periods: totals, transactions, new vs. retained vs. lost customers, revenue change by service, and the most valuable customers who bought in the previous period but not the current one.",
      parameters: {
        type: "object",
        properties: { current_from: dateParam, current_to: dateParam, previous_from: dateParam, previous_to: dateParam },
        required: ["current_from", "current_to", "previous_from", "previous_to"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_revenue_trend",
      description: "Monthly revenue, transaction count and paying customers between two dates.",
      parameters: { type: "object", properties: { from: dateParam, to: dateParam }, required: ["from", "to"], additionalProperties: false },
    },
  },
  {
    type: "function",
    function: {
      name: "get_revenue_by_service",
      description: "Revenue per product/service between two dates.",
      parameters: { type: "object", properties: { from: dateParam, to: dateParam }, required: ["from", "to"], additionalProperties: false },
    },
  },
  {
    type: "function",
    function: {
      name: "get_top_customers",
      description: "Most valuable customers by revenue between two dates.",
      parameters: {
        type: "object",
        properties: { from: dateParam, to: dateParam, limit: { type: "integer", minimum: 1, maximum: 25 } },
        required: ["from", "to"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_overdue_regulars",
      description: "Returning customers who are past their normal purchase interval (have not come back when they usually would).",
      parameters: { type: "object", properties: {}, additionalProperties: false },
    },
  },
  {
    type: "function",
    function: {
      name: "get_customers_at_risk",
      description: "Customers whose revenue dropped (last 90 days vs prior 90) or who have been inactive for a while.",
      parameters: {
        type: "object",
        properties: { inactive_days: { type: "integer", minimum: 14, maximum: 365 } },
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_deals_at_risk",
      description: "Open deals with no recent activity or past their expected close date.",
      parameters: {
        type: "object",
        properties: { idle_days: { type: "integer", minimum: 3, maximum: 120 } },
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_pipeline_summary",
      description: "Number of deals and total value in each pipeline stage.",
      parameters: { type: "object", properties: {}, additionalProperties: false },
    },
  },
  {
    type: "function",
    function: {
      name: "search_customers",
      description: "Find customers by name, email or company and return their revenue.",
      parameters: { type: "object", properties: { query: { type: "string" } }, required: ["query"], additionalProperties: false },
    },
  },
];

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const asDate = (v: unknown, fallback: string) => (typeof v === "string" && ISO.test(v) ? v : fallback);
const asInt = (v: unknown, fallback: number, min: number, max: number) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(min, Math.min(max, Math.round(n))) : fallback;
};
const round = (n: number) => Math.round(n * 100) / 100;

/** Hebrew label for a deal stage (DB values stay in English). */
export const stageLabel = (stage: string) => STAGE_NAMES[stage as DealStage] ?? stage;

/** "yyyy-mm-dd" → "DD/MM/YYYY" (the date format Israeli users read). */
export function dmy(iso: string | null | undefined) {
  const m = iso?.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : (iso ?? "");
}

function addAction(ctx: ToolContext, action: AnalystAction) {
  if (!ctx.actions.some((a) => a.type === action.type && a.label === action.label)) ctx.actions.push(action);
}

/** Executes a tool by name. Results are compact JSON-able objects for the model. */
export async function runAnalystTool(name: string, args: Record<string, unknown>, ctx: ToolContext): Promise<unknown> {
  const { supabase, orgId } = ctx;
  ctx.toolsUsed.push(name);
  const year = resolveRange("12m");

  switch (name) {
    case "get_business_overview": {
      const [counts, revenue, customers] = await Promise.all([
        getDataCounts(supabase, orgId),
        getRevenueSummary(supabase, orgId, year.from, year.to, "previous_year"),
        getCustomerStats(supabase, orgId, 90),
      ]);
      return {
        currency: ctx.currency,
        record_counts: counts,
        revenue_last_12_months: round(revenue.total),
        revenue_previous_12_months: round(revenue.compare_total),
        revenue_this_month_to_date: round(revenue.this_month),
        revenue_same_days_last_month: round(revenue.last_month_to_date),
        revenue_last_full_month: round(revenue.last_month),
        first_transaction: revenue.first_date,
        last_transaction: revenue.last_date,
        customers,
      };
    }
    case "compare_periods": {
      const cur = { from: asDate(args.current_from, year.from), to: asDate(args.current_to, year.to) };
      const prev = { from: asDate(args.previous_from, year.from), to: asDate(args.previous_to, year.to) };
      const [breakdown, lapsed] = await Promise.all([
        getRevenueBreakdown(supabase, orgId, cur, prev),
        getLapsedCustomers(supabase, orgId, cur, prev, 50),
      ]);
      if (lapsed.length) {
        addAction(ctx, {
          type: "view_customers",
          label: "הצג לקוחות",
          customerIds: lapsed.map((c) => c.id),
          title: `קנו בין ${dmy(prev.from)} ל-${dmy(prev.to)} ולא חזרו מאז`,
        });
      }
      return {
        currency: ctx.currency,
        current_period: cur,
        previous_period: prev,
        ...breakdown,
        change_pct: breakdown.previous_total
          ? round(((breakdown.current_total - breakdown.previous_total) / breakdown.previous_total) * 100)
          : null,
        lapsed_customers_count: lapsed.length,
        top_lapsed_customers: lapsed.slice(0, 8).map((c) => ({
          name: c.name,
          revenue_in_previous_period: round(c.previous_revenue),
          last_purchase: c.last_purchase,
          lifetime_revenue: round(c.lifetime_revenue),
        })),
      };
    }
    case "get_revenue_trend": {
      const rows = await getRevenueByMonth(supabase, orgId, asDate(args.from, year.from), asDate(args.to, year.to));
      return rows.map((r) => ({ month: r.month.slice(0, 7), revenue: round(r.revenue), transactions: r.tx_count, customers: r.customers }));
    }
    case "get_revenue_by_service": {
      const rows = await getRevenueByService(supabase, orgId, asDate(args.from, year.from), asDate(args.to, year.to), 12);
      return rows.map((r) => ({ ...r, revenue: round(r.revenue) }));
    }
    case "get_top_customers": {
      const rows = await getTopCustomers(
        supabase,
        orgId,
        asDate(args.from, year.from),
        asDate(args.to, year.to),
        asInt(args.limit, 10, 1, 25),
      );
      if (rows.length) addAction(ctx, { type: "view_customers", label: "הצג לקוחות מובילים", customerIds: rows.map((r) => r.id), title: "לקוחות מובילים" });
      return rows.map((r) => ({ name: r.name, revenue: round(r.revenue), purchases: r.purchases, last_purchase: r.last_purchase }));
    }
    case "get_overdue_regulars": {
      const rows = await getOverdueCustomers(supabase, orgId, 1.5, 50);
      if (rows.length) {
        addAction(ctx, {
          type: "view_customers",
          label: "הצג לקוחות שלא חזרו",
          customerIds: rows.map((r) => r.id),
          title: "לקוחות קבועים שעבר זמן החזרה הרגיל שלהם",
        });
        addAction(ctx, {
          type: "create_tasks",
          label: "צור משימות מעקב",
          customerIds: rows.map((r) => r.id),
          taskTitle: "לחזור ללקוח",
        });
      }
      return {
        count: rows.length,
        customers: rows.slice(0, 12).map((r) => ({
          name: r.name,
          usual_interval_days: r.median_interval_days,
          days_since_last_purchase: r.days_since,
          purchases: r.purchases,
          lifetime_revenue: round(r.total_revenue),
        })),
      };
    }
    case "get_customers_at_risk": {
      const rows = await getCustomersAtRisk(supabase, orgId, asInt(args.inactive_days, 60, 14, 365), 30, 50);
      if (rows.length) {
        addAction(ctx, { type: "view_customers", label: "הצג לקוחות בסיכון", customerIds: rows.map((r) => r.id), title: "לקוחות בסיכון" });
      }
      return {
        count: rows.length,
        customers: rows.slice(0, 12).map((r) => ({
          name: r.name,
          revenue_last_90_days: round(r.recent_revenue),
          revenue_prior_90_days: round(r.previous_revenue),
          change_pct: r.change_pct,
          days_since_last_activity: r.days_since,
          average_purchase: round(r.avg_ticket),
          reason: r.reason,
        })),
      };
    }
    case "get_deals_at_risk": {
      const rows = await getDealsAtRisk(supabase, orgId, asInt(args.idle_days, 14, 3, 120), 50);
      if (rows.length) {
        addAction(ctx, {
          type: "create_tasks",
          label: rows.length === 1 ? "צור משימת מעקב לעסקה" : `צור משימות מעקב ל-${rows.length} עסקאות`,
          dealIds: rows.map((r) => r.id),
          taskTitle: "מעקב אחרי העסקה",
        });
      }
      return {
        count: rows.length,
        total_value: round(rows.reduce((s, r) => s + r.value, 0)),
        deals: rows.slice(0, 12).map((r) => ({
          name: r.name,
          customer: r.customer_name,
          value: round(r.value),
          stage: r.stage,
          stage_label: stageLabel(r.stage),
          days_without_activity: r.days_idle,
          expected_close: r.expected_close,
          reason: r.reason,
        })),
      };
    }
    case "get_pipeline_summary": {
      const rows = await getPipelineSummary(supabase, orgId);
      return rows.map((r) => ({ ...r, stage_label: stageLabel(r.stage) }));
    }
    case "search_customers": {
      const q = String(args.query ?? "").trim().slice(0, 80).replace(/[%,()]/g, " ");
      if (!q) return [];
      const { data } = await supabase
        .from("customers")
        .select("id, name, email, company, status, created_at")
        .eq("organization_id", orgId)
        .or(`name.ilike.%${q}%,email.ilike.%${q}%,company.ilike.%${q}%`)
        .limit(8);
      return data ?? [];
    }
    default:
      return { error: `Unknown tool ${name}` };
  }
}
