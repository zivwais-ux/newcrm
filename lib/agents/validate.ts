import { z } from "zod";

// What the agent team returns is checked again here before anything is stored or shown:
// only known action types, only ids that exist in the snapshot the agents saw, bounded text.

export const AGENT_KEYS = ["revenue", "customers", "sales", "chief"] as const;
export type AgentKey = (typeof AGENT_KEYS)[number];

export const AGENT_VIEWS = ["customers_at_risk", "lapsed_customers", "never_bought", "stuck_deals", "pipeline", "revenue"] as const;
export const AGENT_RECIPES = ["win_back", "stuck_deal", "thank_first_purchase", "pending_payment", "won_deal", "new_lead_followup"] as const;

const text = (max: number) => z.string().trim().min(1).max(max);
const id = z.string().uuid().nullish();

const rawAction = z.object({
  type: z.string(),
  label: z.string().default(""),
  customer_id: z.string().nullish(),
  deal_id: z.string().nullish(),
  text: z.string().nullish(),
  view: z.string().nullish(),
  recipe: z.string().nullish(),
});

export const agentActionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("create_task"), label: text(60), text: text(200), customer_id: id, deal_id: id }),
  z.object({ type: z.literal("prepare_whatsapp"), label: text(60), text: text(1000), customer_id: z.string().uuid() }),
  z.object({ type: z.literal("open_view"), label: text(60), view: z.enum(AGENT_VIEWS) }),
  z.object({ type: z.literal("create_flow"), label: text(60), recipe: z.enum(AGENT_RECIPES) }),
]);
export type AgentAction = z.infer<typeof agentActionSchema>;

export interface Evidence {
  label: string;
  value: string;
}

export interface Insight {
  headline: string;
  detail: string | null;
  severity: "info" | "opportunity" | "warning" | "critical";
  evidence: Evidence[];
  actions: AgentAction[];
}

export interface KnownRecords {
  customers: Set<string>;
  /** Customers that have a phone (WhatsApp actions need one). */
  phones: Set<string>;
  deals: Set<string>;
}

const rawInsight = z.object({
  headline: z.string(),
  detail: z.string().nullish(),
  severity: z.string(),
  evidence: z.array(z.object({ label: z.string(), value: z.union([z.string(), z.number()]) })).default([]),
  actions: z.array(rawAction).default([]),
});

const SEVERITIES = new Set(["info", "opportunity", "warning", "critical"]);
const clip = (s: string, max: number) => (s.length > max ? `${s.slice(0, max - 1)}…` : s);

/** Keeps a suggested action only if it is well-formed and every record it names is real. */
export function cleanAction(raw: unknown, known: KnownRecords): AgentAction | null {
  const base = rawAction.safeParse(raw);
  if (!base.success) return null;
  const a = base.data;
  // Fill a missing task title from the button label; drop fields that don't belong to the type.
  const candidate =
    a.type === "create_task"
      ? { type: a.type, label: a.label, text: a.text || a.label, customer_id: a.customer_id || null, deal_id: a.deal_id || null }
      : a.type === "prepare_whatsapp"
        ? { type: a.type, label: a.label, text: a.text, customer_id: a.customer_id }
        : a.type === "open_view"
          ? { type: a.type, label: a.label, view: a.view }
          : { type: a.type, label: a.label, recipe: a.recipe };
  const parsed = agentActionSchema.safeParse(candidate);
  if (!parsed.success) return null;
  const v = parsed.data;
  if (v.type === "create_task") {
    if (v.customer_id && !known.customers.has(v.customer_id)) return null;
    if (v.deal_id && !known.deals.has(v.deal_id)) return null;
  }
  if (v.type === "prepare_whatsapp" && (!known.customers.has(v.customer_id) || !known.phones.has(v.customer_id))) return null;
  return v;
}

export function cleanInsights(raw: unknown, known: KnownRecords): { insights: Insight[]; dropped: number } {
  const list = z.array(z.unknown()).safeParse(raw);
  let dropped = 0;
  const insights: Insight[] = [];
  for (const item of list.success ? list.data.slice(0, 4) : []) {
    const p = rawInsight.safeParse(item);
    if (!p.success || !p.data.headline.trim() || !SEVERITIES.has(p.data.severity)) {
      dropped++;
      continue;
    }
    const actions: AgentAction[] = [];
    for (const a of p.data.actions.slice(0, 3)) {
      const c = cleanAction(a, known);
      if (c) actions.push(c);
      else dropped++;
    }
    insights.push({
      headline: clip(p.data.headline.trim(), 200),
      detail: p.data.detail?.trim() ? clip(p.data.detail.trim(), 1000) : null,
      severity: p.data.severity as Insight["severity"],
      evidence: p.data.evidence.slice(0, 4).map((e) => ({ label: clip(e.label.trim(), 60), value: clip(String(e.value).trim(), 40) })),
      actions,
    });
  }
  return { insights, dropped };
}

const sourceSchema = z.object({ type: z.enum(["customer", "deal", "email", "insight", "metric"]), id: z.string().nullish(), label: z.string() });

export interface BrainAnswer {
  answer: string;
  sources: { type: "customer" | "deal" | "email" | "insight" | "metric"; id: string | null; label: string }[];
  actions: AgentAction[];
  confidence: "high" | "medium" | "low";
}

/** The Brain's answer, with sources pointing only at real records and actions checked like the team's. */
export function cleanAnswer(raw: unknown, known: KnownRecords): BrainAnswer | null {
  const p = z
    .object({
      answer: z.string(),
      sources: z.array(z.unknown()).default([]),
      actions: z.array(z.unknown()).default([]),
      confidence: z.enum(["high", "medium", "low"]).catch("medium"),
    })
    .safeParse(raw);
  if (!p.success || !p.data.answer.trim()) return null;
  const sources: BrainAnswer["sources"] = [];
  for (const s of p.data.sources.slice(0, 8)) {
    const v = sourceSchema.safeParse(s);
    if (!v.success) continue;
    const ok =
      v.data.type === "customer" ? !!v.data.id && known.customers.has(v.data.id) : v.data.type === "deal" ? !!v.data.id && known.deals.has(v.data.id) : true;
    if (ok) sources.push({ type: v.data.type, id: v.data.id ?? null, label: clip(v.data.label.trim(), 80) });
  }
  const actions = p.data.actions
    .slice(0, 2)
    .map((a) => cleanAction(a, known))
    .filter((a): a is AgentAction => a !== null);
  return { answer: clip(p.data.answer.trim(), 4000), sources, actions, confidence: p.data.confidence };
}
