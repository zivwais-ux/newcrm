import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { formatCurrency, isoDate } from "@/lib/utils";
import { lastTwoFullMonths } from "@/lib/analytics/dates";
import { ANALYST_TOOLS, runAnalystTool, type AnalystAction, type ToolContext } from "./analyst-tools";
import { AI_FAILED_NOTICE, AI_UNAVAILABLE_NOTICE, aiModel, getOpenAI } from "./openai";

export interface AnalystMessage {
  role: "user" | "assistant";
  content: string;
}

export interface AnalystResponse {
  answer: string;
  actions: AnalystAction[];
  toolsUsed: string[];
  aiUsed: boolean;
  notice: string | null;
}

const MAX_TOOL_ROUNDS = 5;

function systemPrompt(orgName: string, businessType: string, currency: string) {
  const today = new Date();
  const months = lastTwoFullMonths(today);
  return [
    `You are the AI Business Analyst inside a Business OS for "${orgName}", a ${businessType} business.`,
    `Today is ${isoDate(today)}. Currency: ${currency}. Last full month: ${months.current.from}..${months.current.to}; the month before: ${months.previous.from}..${months.previous.to}.`,
    "Rules:",
    "- Answer ONLY from tool results. Always call tools before answering a question about the business. Never invent numbers or customers.",
    "- For 'why did revenue/sales go down/up' or 'what changed', call compare_periods (default: last full month vs the month before) and look at lost customers, new customers, service changes and transaction counts. Consider get_overdue_regulars too.",
    "- Be concise and specific: lead with the answer, then 2–4 short bullet points with concrete numbers and names. Format money with the currency.",
    "- If the data is insufficient, say exactly what is missing (e.g. 'no transactions before March') and suggest importing it.",
    "- You can only read data. You cannot create, edit or delete anything. If an action would help (e.g. follow-up tasks), say the user can do it with the buttons below your answer.",
    "- Use plain text with '- ' bullets and **bold** for key numbers. No tables, no headings.",
  ].join("\n");
}

export async function runAnalyst(
  supabase: SupabaseClient,
  org: { id: string; name: string; business_type: string; currency: string },
  history: AnalystMessage[],
): Promise<AnalystResponse> {
  const ctx: ToolContext = { supabase, orgId: org.id, currency: org.currency, actions: [], toolsUsed: [] };
  const openai = getOpenAI();
  const question = history.filter((m) => m.role === "user").at(-1)?.content ?? "";

  if (!openai) return fallbackAnalyst(question, ctx, AI_UNAVAILABLE_NOTICE);

  const messages: ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt(org.name, org.business_type, org.currency) },
    ...history.slice(-10).map((m) => ({ role: m.role, content: m.content.slice(0, 4000) }) as ChatCompletionMessageParam),
  ];

  try {
    for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
      const completion = await openai.chat.completions.create({
        model: aiModel(),
        temperature: 0.2,
        messages,
        tools: ANALYST_TOOLS,
        tool_choice: round === MAX_TOOL_ROUNDS ? "none" : "auto",
      });
      const msg = completion.choices[0]?.message;
      if (!msg) throw new Error("Empty completion");
      const toolCalls = (msg.tool_calls ?? []).filter((c) => c.type === "function");
      if (!toolCalls.length) {
        return {
          answer: msg.content?.trim() || "I couldn't find an answer in your data.",
          actions: ctx.actions,
          toolsUsed: [...new Set(ctx.toolsUsed)],
          aiUsed: true,
          notice: null,
        };
      }
      messages.push(msg);
      const results = await Promise.all(
        toolCalls.map(async (call) => {
          let args: Record<string, unknown> = {};
          try {
            args = JSON.parse(call.function.arguments || "{}");
          } catch {
            /* ignore malformed args */
          }
          let content: string;
          try {
            content = JSON.stringify(await runAnalystTool(call.function.name, args, ctx)).slice(0, 12_000);
          } catch {
            content = JSON.stringify({ error: "This data could not be loaded." });
          }
          return { role: "tool" as const, tool_call_id: call.id, content };
        }),
      );
      messages.push(...results);
    }
    throw new Error("Tool loop exhausted");
  } catch (error) {
    console.error("[ai] analyst failed", (error as Error).message);
    ctx.actions = [];
    ctx.toolsUsed = [];
    return fallbackAnalyst(question, ctx, AI_FAILED_NOTICE);
  }
}

// ---------------------------------------------------------------------------
// Deterministic analyst: answers the most common questions from the same tools
// when OpenAI is not configured or fails. Every number comes from the database.
// ---------------------------------------------------------------------------

type Intent = "revenue_change" | "top_customers" | "attention" | "deal_risk" | "pipeline" | "overview";

export function classifyIntent(q: string): Intent {
  const s = q.toLowerCase();
  if (/(deal|pipeline|opportunit).*(risk|stall|stuck|attention)|at risk.*deal|עסקאות.*סיכון/.test(s)) return "deal_risk";
  if (/(why|what).*(revenue|sales|income).*(down|drop|decreas|fall|low|up|increas|chang)|what changed|revenue (down|drop)|sales (down|drop)|למה.*(הכנסות|מכירות)|מה השתנה/.test(s))
    return "revenue_change";
  if (/(top|best|most valuable|biggest|vip).*(customer|client)|לקוחות.*(הכי|מובילים|טובים)/.test(s)) return "top_customers";
  if (/(attention|haven'?t (purchased|bought|returned)|inactive|churn|at risk|lapsed|not (come|came) back|need.*follow)|צריכים תשומת לב|לא חזרו|לא קנו/.test(s))
    return "attention";
  if (/pipeline|deals|stage|עסקאות|משפך/.test(s)) return "pipeline";
  return "overview";
}

const pct = (cur: number, prev: number) => (prev ? Math.round(((cur - prev) / Math.abs(prev)) * 100) : null);

async function fallbackAnalyst(question: string, ctx: ToolContext, notice: string): Promise<AnalystResponse> {
  const money = (n: number) => formatCurrency(n, ctx.currency);
  const intent = classifyIntent(question);
  const lines: string[] = [];

  type Overview = {
    record_counts: Record<string, number>;
    revenue_last_12_months: number;
    revenue_previous_12_months: number;
    revenue_last_full_month: number;
    customers: { total: number; active: number; new_30d: number };
  };

  try {
    if (intent === "revenue_change") {
      const m = lastTwoFullMonths();
      type Cmp = {
        current_total: number;
        previous_total: number;
        current_tx: number;
        previous_tx: number;
        lost_customers: number;
        lost_customers_revenue: number;
        new_customers: number;
        new_customers_revenue: number;
        retained_revenue_change: number;
        services: { service: string; change: number }[];
        top_lapsed_customers: { name: string; revenue_in_previous_period: number }[];
      };
      const [c, overdue] = (await Promise.all([
        runAnalystTool(
          "compare_periods",
          { current_from: m.current.from, current_to: m.current.to, previous_from: m.previous.from, previous_to: m.previous.to },
          ctx,
        ),
        runAnalystTool("get_overdue_regulars", {}, ctx),
      ])) as [Cmp, { count: number }];

      if (!c.current_total && !c.previous_total) {
        lines.push(`I don't see any revenue in ${m.previous.label} or ${m.current.label}. Import your transactions so I can compare periods.`);
      } else {
        const change = pct(c.current_total, c.previous_total);
        const diff = c.current_total - c.previous_total;
        const direction = diff < 0 ? "down" : "up";
        lines.push(
          `Revenue in ${m.current.label} was **${money(c.current_total)}**, ${direction} **${change === null ? "—" : `${Math.abs(change)}%`}** from ${money(c.previous_total)} in ${m.previous.label} (${diff < 0 ? "−" : "+"}${money(Math.abs(diff))}).`,
        );
        const drivers: string[] = [];
        if (c.lost_customers > 0)
          drivers.push(
            `**${c.lost_customers} customers** who bought in ${m.previous.label} didn't buy in ${m.current.label} — together they spent **${money(c.lost_customers_revenue)}** the month before.`,
          );
        if (c.new_customers > 0) drivers.push(`${c.new_customers} new customers brought in ${money(c.new_customers_revenue)}.`);
        if (Math.abs(c.retained_revenue_change) > 0)
          drivers.push(
            `Customers who bought in both months spent ${money(Math.abs(c.retained_revenue_change))} ${c.retained_revenue_change < 0 ? "less" : "more"}.`,
          );
        if (c.previous_tx) drivers.push(`Transactions went from ${c.previous_tx} to ${c.current_tx}.`);
        const svc = [...c.services].sort((a, b) => (diff < 0 ? a.change - b.change : b.change - a.change))[0];
        if (svc && Math.sign(svc.change) === Math.sign(diff) && svc.change !== 0)
          drivers.push(`The biggest service change was **${svc.service}** (${svc.change < 0 ? "−" : "+"}${money(Math.abs(svc.change))}).`);
        if (overdue.count > 0) drivers.push(`${overdue.count} regular customers are past their usual return date.`);
        if (drivers.length) {
          lines.push("", diff < 0 ? "The likely reasons:" : "What drove it:");
          lines.push(...drivers.map((d) => `- ${d}`));
        }
        if (c.top_lapsed_customers.length && diff < 0) {
          lines.push(
            "",
            `Biggest customers who didn't return: ${c.top_lapsed_customers
              .slice(0, 3)
              .map((x) => `${x.name} (${money(x.revenue_in_previous_period)})`)
              .join(", ")}.`,
          );
        }
      }
    } else if (intent === "top_customers") {
      const from = isoDate(new Date(new Date().setFullYear(new Date().getFullYear() - 1)));
      const rows = (await runAnalystTool("get_top_customers", { from, to: isoDate(new Date()), limit: 10 }, ctx)) as {
        name: string;
        revenue: number;
        purchases: number;
      }[];
      if (!rows.length) lines.push("I don't see any revenue in the last 12 months yet. Import transactions to rank your customers.");
      else {
        const total = rows.reduce((s, r) => s + r.revenue, 0);
        lines.push(`Your top ${rows.length} customers over the last 12 months generated **${money(total)}**:`, "");
        lines.push(...rows.slice(0, 8).map((r, i) => `- ${i + 1}. **${r.name}** — ${money(r.revenue)} across ${r.purchases} purchases`));
      }
    } else if (intent === "attention") {
      const [overdue, risk] = (await Promise.all([
        runAnalystTool("get_overdue_regulars", {}, ctx),
        runAnalystTool("get_customers_at_risk", { inactive_days: 60 }, ctx),
      ])) as [
        { count: number; customers: { name: string; days_since_last_purchase: number; usual_interval_days: number }[] },
        { count: number; customers: { name: string; change_pct: number | null; days_since_last_activity: number }[] },
      ];
      if (!overdue.count && !risk.count) lines.push("Good news — no customers currently look at risk based on their purchase history.");
      else {
        lines.push(`I found **${risk.count} customers at risk** and **${overdue.count} regulars** who are past their usual return date.`);
        if (risk.customers.length) {
          lines.push("", "Most at risk:");
          lines.push(
            ...risk.customers.slice(0, 5).map(
              (c) =>
                `- **${c.name}** — ${c.change_pct !== null ? `revenue ${c.change_pct}%, ` : ""}last activity ${c.days_since_last_activity} days ago`,
            ),
          );
        }
        if (overdue.customers.length) {
          lines.push("", "Usually back by now:");
          lines.push(
            ...overdue.customers
              .slice(0, 4)
              .map((c) => `- **${c.name}** — usually every ${c.usual_interval_days} days, last seen ${c.days_since_last_purchase} days ago`),
          );
        }
      }
    } else if (intent === "deal_risk") {
      const r = (await runAnalystTool("get_deals_at_risk", { idle_days: 14 }, ctx)) as {
        count: number;
        total_value: number;
        deals: { name: string; value: number; stage: string; days_without_activity: number }[];
      };
      if (!r.count) lines.push("No open deals look stalled right now.");
      else {
        lines.push(`**${r.count} open deals** worth **${money(r.total_value)}** need attention:`, "");
        lines.push(...r.deals.slice(0, 6).map((d) => `- **${d.name}** — ${money(d.value)}, ${d.stage}, no activity for ${d.days_without_activity} days`));
      }
    } else if (intent === "pipeline") {
      const rows = (await runAnalystTool("get_pipeline_summary", {}, ctx)) as { stage: string; deals: number; value: number }[];
      const open = rows.filter((r) => !["won", "lost"].includes(r.stage));
      const openValue = open.reduce((s, r) => s + r.value, 0);
      if (!rows.some((r) => r.deals)) lines.push("There are no deals in your pipeline yet.");
      else {
        lines.push(`Your open pipeline is worth **${money(openValue)}** across ${open.reduce((s, r) => s + r.deals, 0)} deals:`, "");
        lines.push(...rows.filter((r) => r.deals).map((r) => `- ${r.stage[0].toUpperCase()}${r.stage.slice(1)}: ${r.deals} deals, ${money(r.value)}`));
      }
    } else {
      const o = (await runAnalystTool("get_business_overview", {}, ctx)) as Overview;
      const change = pct(o.revenue_last_12_months, o.revenue_previous_12_months);
      if (!o.record_counts.customers && !o.record_counts.transactions)
        lines.push("Your workspace doesn't have business data yet. Import a CSV or Excel file and I'll analyze it.");
      else {
        lines.push(
          `Here's a snapshot: **${o.customers.total} customers** (${o.customers.active} active in the last 90 days, ${o.customers.new_30d} new this month) and **${money(o.revenue_last_12_months)}** revenue over the last 12 months${change !== null ? ` (${change > 0 ? "+" : ""}${change}% year over year)` : ""}.`,
          "",
          "Try asking: “Why is revenue down?”, “Who are my top customers?” or “Which customers need attention?”",
        );
      }
    }
  } catch {
    return {
      answer: "I couldn't load your data right now. Please try again in a moment.",
      actions: [],
      toolsUsed: [],
      aiUsed: false,
      notice,
    };
  }

  return { answer: lines.join("\n"), actions: ctx.actions, toolsUsed: [...new Set(ctx.toolsUsed)], aiUsed: false, notice };
}
