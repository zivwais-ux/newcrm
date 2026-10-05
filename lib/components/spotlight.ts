import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Activity, Customer, Deal, Task, Transaction } from "@/types/domain";

/** Everything the Customer Spotlight shows — read under RLS, so only the caller's org. */
export async function getCustomerSpotlight(supabase: SupabaseClient, orgId: string, id: string) {
  const { data: customer } = await supabase.from("customers").select("*").eq("id", id).eq("organization_id", orgId).maybeSingle();
  if (!customer) return null;
  const [tx, tasks, deals, acts] = await Promise.all([
    supabase.from("transactions").select("amount, type, status, date, product_or_service").eq("customer_id", id).order("date", { ascending: false }),
    supabase.from("tasks").select("*").eq("customer_id", id).eq("status", "open").order("due_date").limit(5),
    supabase.from("deals").select("*").eq("customer_id", id).not("stage", "in", "(won,lost)").limit(5),
    supabase.from("activities").select("*").eq("customer_id", id).order("date", { ascending: false }).limit(3),
  ]);
  const history = (tx.data ?? []) as Pick<Transaction, "amount" | "type" | "status" | "date" | "product_or_service">[];
  const value = (t: (typeof history)[number]) =>
    t.status === "cancelled" ? 0 : t.type === "refund" || t.status === "refunded" ? -Math.abs(Number(t.amount)) : Number(t.amount);
  const purchases = history.filter((t) => t.type !== "refund" && t.status !== "cancelled");
  const asc = [...purchases].reverse();
  const gaps = asc.slice(1).map((t, i) => (new Date(t.date).getTime() - new Date(asc[i].date).getTime()) / 86_400_000).sort((a, b) => a - b);
  return {
    customer: customer as Customer,
    totalRevenue: history.reduce((s, t) => s + value(t), 0),
    purchases: purchases.length,
    lastPurchase: purchases[0]?.date ?? null,
    usualInterval: gaps.length ? Math.round(gaps[Math.floor(gaps.length / 2)]) : null,
    recent: purchases.slice(0, 5),
    tasks: (tasks.data ?? []) as Task[],
    deals: (deals.data ?? []) as Deal[],
    activities: (acts.data ?? []) as Activity[],
  };
}
export type SpotlightData = NonNullable<Awaited<ReturnType<typeof getCustomerSpotlight>>>;
