import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { israelDay, israelToday } from "@/lib/analytics/dates";
import type { Activity, Customer, Deal, Task, Transaction } from "@/types/domain";

/** Transactions read per customer. Totals are exact for anyone below this; a note shows otherwise. */
const TX_LIMIT = 2000;

type SpotlightTx = Pick<Transaction, "amount" | "type" | "status" | "date" | "product_or_service">;

/** Mirrors SQL public.revenue_value: only paid sales count; refunds subtract once; cancelled refunds are 0. */
export function revenueValue(t: Pick<Transaction, "amount" | "type" | "status">) {
  const amount = Number(t.amount) || 0;
  if (t.type === "refund") return t.status === "cancelled" ? 0 : -Math.abs(amount);
  return t.status === "paid" ? amount : 0;
}

/** Mirrors SQL public.is_paid_sale. */
export function isPaidSale(t: Pick<Transaction, "type" | "status">) {
  return t.type !== "refund" && t.status === "paid";
}

function dayNumber(ymd: string) {
  const [y, m, d] = ymd.slice(0, 10).split("-").map(Number);
  return Date.UTC(y, m - 1, d) / 86_400_000;
}

/** Pure summary of a customer's transactions (newest first), as the SQL profile computes it. */
export function summarizeTransactions(history: SpotlightTx[], today = israelToday()) {
  const sales = history.filter(isPaidSale);
  // A "purchase" is a distinct day with a paid sale (same as customer_purchase_profile).
  const days = [...new Set(sales.map((t) => t.date.slice(0, 10)))].sort();
  const gaps = days
    .slice(1)
    .map((d, i) => dayNumber(d) - dayNumber(days[i]))
    .sort((a, b) => a - b);
  const lastPurchase = days.length ? days[days.length - 1] : null;
  return {
    totalRevenue: history.reduce((s, t) => s + revenueValue(t), 0),
    purchases: days.length,
    lastPurchase,
    daysSinceLastPurchase: lastPurchase ? Math.max(0, dayNumber(today) - dayNumber(lastPurchase)) : null,
    usualInterval: gaps.length ? Math.round(gaps[Math.floor(gaps.length / 2)]) : null,
    recent: sales.slice(0, 5),
  };
}

async function loadSpotlight(supabase: SupabaseClient, orgId: string, id: string) {
  const { data: customer, error } = await supabase
    .from("customers")
    .select("*")
    .eq("id", id)
    .eq("organization_id", orgId)
    .maybeSingle();
  if (error) throw error;
  if (!customer) return null;
  const endOfToday = israelDay().end;
  const [tx, tasks, deals, acts] = await Promise.all([
    supabase
      .from("transactions")
      .select("amount, type, status, date, product_or_service")
      .eq("organization_id", orgId)
      .eq("customer_id", id)
      .order("date", { ascending: false })
      .limit(TX_LIMIT),
    supabase
      .from("tasks")
      .select("*")
      .eq("organization_id", orgId)
      .eq("customer_id", id)
      .eq("status", "open")
      .order("due_date", { ascending: true, nullsFirst: false })
      .limit(5),
    supabase
      .from("deals")
      .select("*")
      .eq("organization_id", orgId)
      .eq("customer_id", id)
      .not("stage", "in", "(won,lost)")
      .order("value", { ascending: false })
      .limit(5),
    // Past activity only — scheduled (future) appointments aren't "recent activity".
    supabase
      .from("activities")
      .select("*")
      .eq("organization_id", orgId)
      .eq("customer_id", id)
      .lt("date", endOfToday)
      .order("date", { ascending: false })
      .limit(3),
  ]);
  for (const r of [tx, tasks, deals, acts]) if (r.error) throw r.error;
  const history = (tx.data ?? []) as SpotlightTx[];
  return {
    customer: customer as Customer,
    ...summarizeTransactions(history),
    truncated: history.length >= TX_LIMIT,
    tasks: (tasks.data ?? []) as Task[],
    deals: (deals.data ?? []) as Deal[],
    activities: (acts.data ?? []) as Activity[],
  };
}

export type SpotlightData = NonNullable<Awaited<ReturnType<typeof loadSpotlight>>>;
export type SpotlightResult = ({ status: "ok" } & SpotlightData) | { status: "error"; message: string };

/**
 * Everything the Customer Spotlight shows — read under RLS, so only the caller's org.
 * Never throws: a missing customer or a failed read comes back as an error the sheet shows.
 */
export async function getCustomerSpotlight(supabase: SupabaseClient, orgId: string, id: string): Promise<SpotlightResult> {
  try {
    const data = await loadSpotlight(supabase, orgId, id);
    if (!data) return { status: "error", message: "לא מצאנו את הלקוח הזה. ייתכן שהוא נמחק." };
    return { status: "ok", ...data };
  } catch (error) {
    console.error("[spotlight]", error);
    return { status: "error", message: "לא הצלחנו לטעון את פרטי הלקוח. נסה שוב בעוד רגע." };
  }
}
