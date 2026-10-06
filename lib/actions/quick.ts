"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireOrg } from "@/lib/supabase/server";
import type { ActionResult } from "@/types/domain";
import { fail, friendlyError, ok } from "./errors";

// Fast entry from anywhere in the app: a sale or an appointment in a few taps,
// creating the customer on the fly when they are not in the system yet.

const customerRef = z
  .object({
    id: z.string().uuid().nullable(),
    name: z.string().trim().max(200).default(""),
    phone: z.string().trim().max(40).default(""),
  })
  .refine((c) => c.id || c.name.length > 0, "בחר לקוח או כתוב שם של לקוח חדש");

const serviceName = z.string().trim().max(200).default("");

const saleSchema = z.object({
  customer: customerRef.nullable(),
  amount: z.coerce.number({ message: "הכנס סכום" }).finite().positive("הכנס סכום גדול מאפס").max(1e10),
  service: serviceName,
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "בחר תאריך"),
  status: z.enum(["paid", "pending"]).default("paid"),
  notes: z.string().trim().max(500).default(""),
});

const appointmentSchema = z.object({
  customer: customerRef,
  /** ISO timestamp (the browser converts the local date+time). */
  at: z.string().datetime({ offset: true, message: "בחר תאריך ושעה" }),
  service: serviceName,
  notes: z.string().trim().max(1000).default(""),
});

export interface ServiceChip {
  id: string | null;
  name: string;
  /** Typical price, when known — used to prefill the amount. */
  price: number | null;
}

/** Services to offer as one-tap chips: the services table first, then the most-sold names from sales. */
export async function getServiceChips(): Promise<ServiceChip[]> {
  const { supabase, org } = await requireOrg();
  const [{ data: services }, { data: recent }] = await Promise.all([
    supabase.from("services").select("id, name, price").eq("organization_id", org.id).order("name").limit(40),
    supabase
      .from("transactions")
      .select("product_or_service, amount")
      .eq("organization_id", org.id)
      .eq("status", "paid")
      .eq("type", "sale")
      .not("product_or_service", "is", null)
      .order("date", { ascending: false })
      .limit(300),
  ]);

  // Most frequent recent service names, with their most common price.
  const stats = new Map<string, { count: number; prices: Map<number, number> }>();
  for (const r of recent ?? []) {
    const name = (r.product_or_service ?? "").trim();
    if (!name) continue;
    const s = stats.get(name) ?? { count: 0, prices: new Map() };
    s.count++;
    const amount = Number(r.amount);
    s.prices.set(amount, (s.prices.get(amount) ?? 0) + 1);
    stats.set(name, s);
  }
  const typicalPrice = (name: string) => {
    const prices = stats.get(name)?.prices;
    if (!prices?.size) return null;
    return [...prices.entries()].sort((a, b) => b[1] - a[1])[0][0];
  };

  const chips: ServiceChip[] = (services ?? []).map((s) => ({
    id: s.id,
    name: s.name,
    price: s.price != null ? Number(s.price) : typicalPrice(s.name),
  }));
  const known = new Set(chips.map((c) => c.name));
  const extra = [...stats.entries()]
    .filter(([name]) => !known.has(name))
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 12)
    .map(([name]) => ({ id: null, name, price: typicalPrice(name) }));
  // Most used first: services with sales history float up.
  return [...chips, ...extra].sort((a, b) => (stats.get(b.name)?.count ?? 0) - (stats.get(a.name)?.count ?? 0)).slice(0, 16);
}

async function resolveCustomer(
  supabase: SupabaseClient,
  orgId: string,
  userId: string,
  ref: z.infer<typeof customerRef>,
): Promise<{ id: string; created: boolean } | { error: string }> {
  if (ref.id) return { id: ref.id, created: false };
  const phone = ref.phone || null;
  // Same phone already in the system → that is the customer, don't create a duplicate.
  if (phone) {
    const digits = phone.replace(/\D/g, "");
    if (digits.length >= 9) {
      const { data: existing } = await supabase
        .from("customers")
        .select("id, phone")
        .eq("organization_id", orgId)
        // Digits may be stored with dashes or spaces: match them in order, then verify exactly below.
        .ilike("phone", `%${digits.slice(-9).split("").join("%")}%`)
        .limit(5);
      const match = (existing ?? []).find((c) => (c.phone ?? "").replace(/\D/g, "").endsWith(digits.slice(-9)));
      if (match) return { id: match.id, created: false };
    }
  }
  const { data, error } = await supabase
    .from("customers")
    .insert({ organization_id: orgId, name: ref.name, phone, status: "active", owner_id: userId })
    .select("id")
    .single();
  if (error) return { error: friendlyError(error) };
  return { id: data.id, created: true };
}

async function resolveService(supabase: SupabaseClient, orgId: string, name: string): Promise<string | null> {
  if (!name) return null;
  const { data: existing } = await supabase.from("services").select("id").eq("organization_id", orgId).eq("name", name).maybeSingle();
  if (existing) return existing.id;
  const { data } = await supabase.from("services").insert({ organization_id: orgId, name }).select("id").single();
  return data?.id ?? null;
}

function revalidateAll(customerId: string | null) {
  revalidatePath("/", "layout");
  if (customerId) revalidatePath(`/customers/${customerId}`);
}

export async function quickSale(input: z.input<typeof saleSchema>): Promise<ActionResult<{ id: string; customerId: string | null; customerCreated: boolean }>> {
  const parsed = saleSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "בדוק את הפרטים.");
  const { supabase, org, user } = await requireOrg();
  const v = parsed.data;

  let customerId: string | null = null;
  let customerCreated = false;
  if (v.customer) {
    const res = await resolveCustomer(supabase, org.id, user.id, v.customer);
    if ("error" in res) return fail(res.error);
    customerId = res.id;
    customerCreated = res.created;
  }
  const serviceId = await resolveService(supabase, org.id, v.service);

  const { data, error } = await supabase
    .from("transactions")
    .insert({
      organization_id: org.id,
      customer_id: customerId,
      service_id: serviceId,
      product_or_service: v.service || null,
      amount: v.amount,
      date: v.date,
      status: v.status,
      type: "sale",
      owner_id: user.id,
      custom_fields: v.notes ? { הערה: v.notes } : {},
    })
    .select("id")
    .single();
  if (error) return fail(friendlyError(error));
  if (customerId) await supabase.from("customers").update({ status: "active" }).eq("id", customerId).in("status", ["lead", "inactive"]);
  await supabase.from("ai_briefs").delete().eq("organization_id", org.id);
  revalidateAll(customerId);
  return ok({ id: data.id, customerId, customerCreated });
}

export async function quickAppointment(input: z.input<typeof appointmentSchema>): Promise<ActionResult<{ id: string; customerId: string; customerCreated: boolean }>> {
  const parsed = appointmentSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "בדוק את הפרטים.");
  const { supabase, org, user } = await requireOrg();
  const v = parsed.data;

  const customer = await resolveCustomer(supabase, org.id, user.id, v.customer);
  if ("error" in customer) return fail(customer.error);
  const notes = [v.service, v.notes].filter(Boolean).join(" · ") || null;

  const { data, error } = await supabase
    .from("activities")
    .insert({ organization_id: org.id, customer_id: customer.id, type: "appointment", date: v.at, notes, owner_id: user.id })
    .select("id")
    .single();
  if (error) return fail(friendlyError(error));
  revalidateAll(customer.id);
  return ok({ id: data.id, customerId: customer.id, customerCreated: customer.created });
}

/** Create a customer from a picker (name typed into the search box). */
export async function quickCreateCustomer(name: string, phone?: string): Promise<ActionResult<{ id: string; name: string }>> {
  const parsed = customerRef.safeParse({ id: null, name, phone: phone ?? "" });
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "צריך למלא שם");
  const { supabase, org, user } = await requireOrg();
  const res = await resolveCustomer(supabase, org.id, user.id, parsed.data);
  if ("error" in res) return fail(res.error);
  revalidatePath("/customers");
  return ok({ id: res.id, name: parsed.data.name });
}
