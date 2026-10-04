"use server";

import { z } from "zod";
import { requireOrg } from "@/lib/supabase/server";
import { COMPONENT_REGISTRY } from "@/lib/components/registry";

export interface SearchResult {
  type: "customer" | "lead" | "deal" | "transaction" | "component";
  id: string;
  title: string;
  subtitle: string;
  href: string;
}

const clean = (q: string) => q.trim().slice(0, 80).replace(/[%,()*\\]/g, " ").trim();

export async function globalSearch(query: string): Promise<SearchResult[]> {
  const q = clean(z.string().catch("").parse(query));
  if (q.length < 2) return [];
  const { supabase, org } = await requireOrg();
  const like = `%${q}%`;
  const amount = Number(q.replace(/[^\d.]/g, ""));

  const [customers, leads, deals, transactions] = await Promise.all([
    supabase
      .from("customers")
      .select("id, name, email, company")
      .eq("organization_id", org.id)
      .or(`name.ilike.${like},email.ilike.${like},company.ilike.${like},phone.ilike.${like}`)
      .limit(6),
    supabase
      .from("leads")
      .select("id, name, email, source, status")
      .eq("organization_id", org.id)
      .or(`name.ilike.${like},email.ilike.${like}`)
      .limit(4),
    supabase.from("deals").select("id, name, stage, value").eq("organization_id", org.id).ilike("name", like).limit(4),
    supabase
      .from("transactions")
      .select("id, amount, date, product_or_service, customer_id, customers(name)")
      .eq("organization_id", org.id)
      .or(
        [`product_or_service.ilike.${like}`, Number.isFinite(amount) && amount > 0 ? `amount.eq.${amount}` : null]
          .filter(Boolean)
          .join(","),
      )
      .order("date", { ascending: false })
      .limit(4),
  ]);

  const results: SearchResult[] = [];
  for (const c of customers.data ?? [])
    results.push({ type: "customer", id: c.id, title: c.name, subtitle: c.company ?? c.email ?? "Customer", href: `/customers/${c.id}` });
  for (const l of leads.data ?? [])
    results.push({ type: "lead", id: l.id, title: l.name, subtitle: [l.status, l.source].filter(Boolean).join(" · "), href: `/leads?q=${encodeURIComponent(l.name)}` });
  for (const d of deals.data ?? [])
    results.push({ type: "deal", id: d.id, title: d.name, subtitle: `${d.stage} · ${org.currency} ${Number(d.value).toLocaleString()}`, href: `/deals?deal=${d.id}` });
  for (const t of (transactions.data ?? []) as unknown as {
    id: string;
    amount: number;
    date: string;
    product_or_service: string | null;
    customer_id: string | null;
    customers: { name: string } | null;
  }[])
    results.push({
      type: "transaction",
      id: t.id,
      title: `${t.product_or_service ?? "Transaction"} — ${org.currency} ${Number(t.amount).toLocaleString()}`,
      subtitle: `${t.customers?.name ?? "No customer"} · ${t.date}`,
      href: t.customer_id ? `/customers/${t.customer_id}?tab=transactions` : `/transactions?q=${encodeURIComponent(q)}`,
    });
  const lower = q.toLowerCase();
  for (const c of COMPONENT_REGISTRY.filter((c) => `${c.name} ${c.description}`.toLowerCase().includes(lower)).slice(0, 3))
    results.push({ type: "component", id: c.id, title: c.name, subtitle: c.description, href: `/components?focus=${c.id}` });
  return results;
}

export async function searchCustomers(query: string): Promise<{ id: string; name: string; subtitle: string | null }[]> {
  const { supabase, org } = await requireOrg();
  const q = clean(z.string().catch("").parse(query));
  let req = supabase.from("customers").select("id, name, email, company").eq("organization_id", org.id);
  if (q) req = req.or(`name.ilike.%${q}%,email.ilike.%${q}%,company.ilike.%${q}%`);
  const { data } = await req.order("name").limit(20);
  return (data ?? []).map((c) => ({ id: c.id, name: c.name, subtitle: c.company ?? c.email }));
}

export async function searchDeals(query: string): Promise<{ id: string; name: string; subtitle: string | null }[]> {
  const { supabase, org } = await requireOrg();
  const q = clean(z.string().catch("").parse(query));
  let req = supabase.from("deals").select("id, name, stage").eq("organization_id", org.id);
  if (q) req = req.ilike("name", `%${q}%`);
  const { data } = await req.order("updated_at", { ascending: false }).limit(20);
  return (data ?? []).map((d) => ({ id: d.id, name: d.name, subtitle: d.stage }));
}
