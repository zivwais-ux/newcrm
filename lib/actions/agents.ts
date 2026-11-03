"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { canManage, requireOrg } from "@/lib/supabase/server";
import { recipeByKey } from "@/lib/automations/recipes";
import { resolveTerms } from "@/lib/terms";
import { cleanAnswer, cleanInsights, AGENT_KEYS, type AgentAction, type BrainAnswer, type KnownRecords } from "@/lib/agents/validate";
import type { ActionResult } from "@/types/domain";
import { fail, friendlyError, ok } from "./errors";
import { saveAutomation } from "./automations";

// The agent team (Python, CrewAI) reasons over a read-only snapshot built here with the user's own
// client (RLS). It returns findings; this file checks them and stores them. Suggested actions run
// only when a person approves them.

const TEAM_COOLDOWN_MIN = 10;
const ASK_PER_DAY = 30;
const UNAVAILABLE = "הסוכנים לא זמינים כרגע. נסה שוב בעוד כמה דקות.";

function agentsUrl(): string | null {
  if (process.env.AGENTS_URL) return process.env.AGENTS_URL;
  const host = process.env.VERCEL_ENV === "production" ? process.env.VERCEL_PROJECT_PRODUCTION_URL : process.env.VERCEL_URL;
  return host ? `https://${host}/api/agents` : null;
}

interface Snapshot {
  org: { name: string; currency: string; terms: Record<string, string> };
  today: string;
  stages: { key: string; label: string; kind: string; position: number }[];
  customers: Record<string, unknown>[];
  deals: Record<string, unknown>[];
  transactions: Record<string, unknown>[];
  tasks: Record<string, unknown>[];
  activities: Record<string, unknown>[];
  leads: Record<string, unknown>[];
  emails: Record<string, unknown>[];
  insights: Record<string, unknown>[];
}

async function buildSnapshot(supabase: SupabaseClient, org: { id: string; name: string; currency: string; terms?: Record<string, string> | null }, withInsights: boolean) {
  const since = new Date(Date.now() - 400 * 86400_000).toISOString().slice(0, 10);
  const [stages, customers, deals, transactions, tasks, activities, leads, insights] = await Promise.all([
    supabase.from("deal_stages").select("key, label, kind, position").eq("organization_id", org.id).eq("archived", false).order("position"),
    supabase.from("customers").select("id, name, status, company, phone, created_at, custom_fields").eq("organization_id", org.id).limit(2000),
    supabase.from("deals").select("id, name, stage, value, customer_id, last_activity_at, created_at, expected_close").eq("organization_id", org.id).limit(2000),
    supabase.from("transactions").select("id, customer_id, amount, date, product_or_service, status, type").eq("organization_id", org.id).gte("date", since).limit(5000),
    supabase.from("tasks").select("id, title, status, due_date, customer_id, deal_id").eq("organization_id", org.id).neq("status", "done").limit(500),
    supabase.from("activities").select("id, type, date, customer_id, deal_id").eq("organization_id", org.id).order("date", { ascending: false }).limit(1000),
    supabase.from("leads").select("id, name, status, source, created_at, customer_id").eq("organization_id", org.id).limit(1000),
    withInsights
      ? supabase.from("agent_insights").select("agent, headline, detail, evidence, summary").eq("organization_id", org.id).order("created_at", { ascending: false }).limit(16)
      : Promise.resolve({ data: [] as Record<string, unknown>[] }),
  ]);
  const snapshot: Snapshot = {
    org: { name: org.name, currency: org.currency, terms: resolveTerms(org.terms) as unknown as Record<string, string> },
    today: new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Jerusalem" }),
    stages: (stages.data ?? []) as Snapshot["stages"],
    // Phone numbers stay here: the agents only learn whether there is one.
    customers: (customers.data ?? []).map(({ phone, ...c }) => ({ ...c, has_phone: Boolean(String(phone ?? "").trim()) })),
    deals: deals.data ?? [],
    transactions: (transactions.data ?? []).map(({ product_or_service, ...t }) => ({ ...t, service: product_or_service })),
    tasks: tasks.data ?? [],
    activities: activities.data ?? [],
    leads: leads.data ?? [],
    emails: [], // email is not connected per business yet
    insights: insights.data ?? [],
  };
  const known: KnownRecords = {
    customers: new Set(snapshot.customers.map((c) => String(c.id))),
    phones: new Set(snapshot.customers.filter((c) => c.has_phone).map((c) => String(c.id))),
    deals: new Set(snapshot.deals.map((d) => String(d.id))),
  };
  return { snapshot, known };
}

async function callAgents(supabase: SupabaseClient, payload: Record<string, unknown>): Promise<Record<string, unknown> | null> {
  const url = agentsUrl();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!url || !session?.access_token) return null;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(280_000),
      cache: "no-store",
    });
    if (!res.ok) {
      console.error("[agents]", res.status, (await res.text()).slice(0, 300));
      return null;
    }
    return (await res.json()) as Record<string, unknown>;
  } catch (e) {
    console.error("[agents]", e);
    return null;
  }
}

async function closeRun(supabase: SupabaseClient, runId: string, result: Record<string, unknown> | null, error?: string) {
  const usage = (result?.usage ?? {}) as { prompt_tokens?: number; completion_tokens?: number; cost_usd?: number };
  await supabase
    .from("agent_runs")
    .update({
      status: error ? "failed" : "done",
      prompt_tokens: usage.prompt_tokens ?? 0,
      completion_tokens: usage.completion_tokens ?? 0,
      cost_usd: usage.cost_usd ?? 0,
      duration_ms: typeof result?.duration_ms === "number" ? result.duration_ms : null,
      error: error ?? null,
      finished_at: new Date().toISOString(),
    })
    .eq("id", runId);
}

/** Runs the whole team now and stores what each agent found. */
export async function runAgents(): Promise<ActionResult<{ insights: number; dropped: number }>> {
  const { supabase, org } = await requireOrg();
  const since = new Date(Date.now() - TEAM_COOLDOWN_MIN * 60_000).toISOString();
  const { data: recent } = await supabase
    .from("agent_runs")
    .select("id, status")
    .eq("organization_id", org.id)
    .eq("kind", "team")
    .in("status", ["running", "done"])
    .gte("created_at", since)
    .limit(1);
  if (recent?.length) return fail(recent[0].status === "running" ? "הסוכנים כבר עובדים. זה לוקח בערך חצי דקה." : `הסוכנים רצו לפני פחות מ-${TEAM_COOLDOWN_MIN} דקות.`);

  const { data: run, error } = await supabase.from("agent_runs").insert({ organization_id: org.id, kind: "team" }).select("id").single();
  if (error) return fail(friendlyError(error));
  const { snapshot, known } = await buildSnapshot(supabase, org, false);
  const result = await callAgents(supabase, { mode: "run", run_id: run.id, org_id: org.id, snapshot });
  if (!result) {
    await closeRun(supabase, run.id, null, "unavailable");
    return fail(UNAVAILABLE);
  }

  const reports = (result.reports ?? {}) as Record<string, { summary?: string; insights?: unknown }>;
  const rows: Record<string, unknown>[] = [];
  let dropped = 0;
  for (const agent of AGENT_KEYS) {
    const r = reports[agent];
    if (!r) continue;
    const { insights, dropped: d } = cleanInsights(r.insights, known);
    dropped += d;
    const summary = typeof r.summary === "string" ? r.summary.trim().slice(0, 400) : null;
    const list = insights.length ? insights : summary ? [{ headline: summary, detail: null, severity: "info" as const, evidence: [], actions: [] }] : [];
    list.forEach((i, position) => rows.push({ run_id: run.id, organization_id: org.id, agent, position, summary, ...i }));
  }
  if (rows.length) {
    const { error: insertError } = await supabase.from("agent_insights").insert(rows);
    if (insertError) {
      await closeRun(supabase, run.id, result, "save failed");
      return fail(friendlyError(insertError));
    }
  }
  const errors = result.errors && typeof result.errors === "object" ? Object.keys(result.errors) : [];
  await closeRun(supabase, run.id, result, rows.length ? undefined : errors.join(",") || "empty");
  revalidatePath("/home");
  return ok({ insights: rows.length, dropped });
}

const askSchema = z.object({
  question: z.string().trim().min(2, "כתוב שאלה").max(1000),
  history: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(2000) })).max(12).default([]),
});

/** One question to the business's brain. */
export async function askBrain(input: z.input<typeof askSchema>): Promise<ActionResult<BrainAnswer>> {
  const parsed = askSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "כתוב שאלה");
  const { supabase, org } = await requireOrg();
  const { count } = await supabase
    .from("agent_runs")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", org.id)
    .eq("kind", "ask")
    .gte("created_at", new Date(Date.now() - 86400_000).toISOString());
  if ((count ?? 0) >= ASK_PER_DAY) return fail(`הגעת ל-${ASK_PER_DAY} שאלות היום. אפשר לשאול שוב מחר.`);

  const { data: run, error } = await supabase.from("agent_runs").insert({ organization_id: org.id, kind: "ask" }).select("id").single();
  if (error) return fail(friendlyError(error));
  const { snapshot, known } = await buildSnapshot(supabase, org, true);
  const result = await callAgents(supabase, {
    mode: "ask",
    run_id: run.id,
    org_id: org.id,
    snapshot,
    question: parsed.data.question,
    history: parsed.data.history,
  });
  const answer = result ? cleanAnswer(result.answer, known) : null;
  await closeRun(supabase, run.id, result, answer ? undefined : "unavailable");
  if (!answer) return fail(UNAVAILABLE);
  return ok(answer);
}

/** Approves one suggested action. Tasks and flows run here; WhatsApp and views open in the browser. */
export async function approveAgentAction(action: AgentAction, insightId?: string | null): Promise<ActionResult<{ href?: string }>> {
  const { supabase, org, user, role } = await requireOrg();
  let href: string | undefined;
  if (action.type === "create_task") {
    const { error } = await supabase.from("tasks").insert({
      organization_id: org.id,
      title: action.text.slice(0, 200),
      customer_id: action.customer_id ?? null,
      deal_id: action.deal_id ?? null,
      status: "open",
      due_date: new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Jerusalem" }),
      assigned_to: user.id,
      created_by: user.id,
    });
    if (error) return fail(friendlyError(error));
  } else if (action.type === "create_flow") {
    if (!canManage(role)) return fail("רק בעלים ומנהלים יכולים ליצור זרימות.");
    const recipe = recipeByKey(action.recipe);
    if (!recipe) return fail("הזרימה לא נמצאה.");
    const saved = await saveAutomation({ ...recipe.build(resolveTerms(org.terms)), recipe_key: recipe.key, enabled: false });
    if (!saved.ok) return fail(saved.error);
    href = `/automations/${saved.data.id}`;
  }
  if (insightId && z.string().uuid().safeParse(insightId).success) {
    await markInsight(insightId, "done");
  }
  revalidatePath("/home");
  return ok({ href });
}

export async function markInsight(id: string, status: "done" | "dismissed"): Promise<ActionResult<null>> {
  if (!z.string().uuid().safeParse(id).success) return fail("לא נמצא.");
  const { supabase, org } = await requireOrg();
  const { error } = await supabase.from("agent_insights").update({ status }).eq("id", id).eq("organization_id", org.id);
  if (error) return fail(friendlyError(error));
  return ok(null);
}
