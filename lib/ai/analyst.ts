import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { formatCurrency, formatNumber, isoDate, plural } from "@/lib/utils";
import {
  RANGE_PRESETS,
  israelNow,
  israelToday,
  lastTwoFullMonths,
  monthToDate,
  resolveRange,
  type RangePreset,
} from "@/lib/analytics/dates";
import {
  getCustomersAtRisk,
  getDealsAtRisk,
  getOverdueCustomers,
  getRepeatStats,
  getRevenueByService,
  getRevenueSummaryFiltered,
  getServiceCustomers,
  getTopCustomers,
} from "@/lib/analytics/queries";
import { ANALYST_TOOLS, dmy, runAnalystTool, stageLabel, toolStages, type AnalystAction, type ToolContext } from "./analyst-tools";
import { EMPTY_FILTERS, STAGE_NAMES, type WorkspaceFilters } from "@/lib/components/filters";
import { DEAL_STAGES, type DealStage, type StageDef } from "@/types/domain";
import { ANALYST_MAX_MESSAGE_CHARS, ANALYST_MAX_MESSAGES } from "./limits";
import { AI_FAILED_NOTICE, AI_UNAVAILABLE_NOTICE, aiModel, getOpenAI } from "./openai";
import { DEFAULT_TERMS, resolveTerms, type Terms } from "@/lib/terms";

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

/** "In the period" phrase for each range preset, used inside Hebrew sentences. */
const IN_PERIOD: Record<RangePreset, string> = {
  "30d": "ב-30 הימים האחרונים",
  "90d": "ב-90 הימים האחרונים",
  "6m": "בחצי השנה האחרונה",
  "12m": "ב-12 החודשים האחרונים",
  ytd: "מתחילת השנה",
  all: "בכל התקופה",
};

/** The same-length period right before [from, to] (ISO dates). */
export function previousPeriod(from: string, to: string) {
  const day = 86_400_000;
  const f = Date.parse(`${from}T00:00:00Z`);
  const t = Date.parse(`${to}T00:00:00Z`);
  const len = Math.round((t - f) / day) + 1;
  const prevTo = new Date(f - day);
  const prevFrom = new Date(f - len * day);
  return { from: prevFrom.toISOString().slice(0, 10), to: prevTo.toISOString().slice(0, 10) };
}

/** Workspace filters as a note for the model (empty when nothing is filtered). */
function filtersPrompt(f: WorkspaceFilters, stages?: StageDef[]) {
  const parts: string[] = [];
  if (f.service) parts.push(`only the service/product "${f.service}" (use per-service data)`);
  if (f.range) {
    const r = resolveRange(f.range);
    parts.push(f.range === "all" ? "the whole history" : `the period ${r.from}..${r.to} ("${RANGE_PRESETS[f.range]}") instead of the default periods`);
  }
  if (f.stage) parts.push(`deals in stage "${f.stage}" (${stageLabel(f.stage, stages)})`);
  return parts.length
    ? `- The user is looking at a filtered workspace. Focus on: ${parts.join("; ")}. If a number covers the whole business rather than the filter, say so clearly.`
    : null;
}

/** Tells the model which words this business uses ("מטופלים", "טיפול"…) so answers sound like the owner. */
function termsPrompt(t: Terms) {
  return `- This business has its own words. In Hebrew answers say "${t.customer}" / "${t.customers}" for customer(s), "${t.appointment}" / "${t.appointments}" for appointment(s), "${t.service}" / "${t.services}" for service(s), "${t.deal}" / "${t.deals}" for deal(s) and "${t.sale}" / "${t.sales}" for sale(s). Keep Hebrew grammar (gender/number) correct for these words.`;
}

function systemPrompt(orgName: string, businessType: string, currency: string, filters: WorkspaceFilters, stages?: StageDef[], terms: Terms = DEFAULT_TERMS) {
  const today = israelToday();
  const months = lastTwoFullMonths();
  return [
    `You are "היועץ החכם" (the smart business advisor) inside a Business OS for "${orgName}", a ${businessType} business.`,
    `Today is ${today} (${dmy(today)}, Israel time). Revenue counts paid sales only (pending, cancelled and refunded sales are excluded; refunds are subtracted). Currency: ${currency}. Last full month: ${months.current.from}..${months.current.to}; the month before: ${months.previous.from}..${months.previous.to}.`,
    "Language and style:",
    "- ALWAYS answer in clear, simple, everyday Hebrew, even if the question is in English. The reader is a small-business owner with no technical or financial background: no jargon, no English terms, no tool or field names.",
    "- Be short: lead with the direct answer in one sentence, then at most 2–4 short bullet points with concrete numbers and names.",
    `- Format money like ₪1,250 (currency symbol first, comma thousands separator, no decimals; currency ${currency}). Format percentages like 12%. Write dates to the user as DD/MM/YYYY (e.g. 05/10/2026); tool arguments still use ISO yyyy-mm-dd.`,
    "- When relevant, end with ONE concrete suggested next step on its own line, starting with '**מה כדאי לעשות:**' (e.g. who to call, which service to promote). Base it only on the data.",
    "- Use plain text with '- ' bullets and **bold** for key numbers. No tables, no headings.",
    termsPrompt(terms),
    "Grounding rules:",
    "- Answer ONLY from tool results. Always call tools before answering a question about the business. Never invent numbers, customers or services.",
    "- For 'why did revenue/sales go down/up' or 'what changed', call compare_periods (default: last full month vs the month before) and look at lost customers, new customers, service changes and transaction counts. Consider get_overdue_regulars too.",
    "- The question may end with a context note in parentheses (e.g. 'התמקד ב: רק השירות/המוצר \"X\"' or 'Focus on only the service \"X\"'). Respect it: focus on that service, period or stage using the per-service data (get_revenue_by_service, the services in compare_periods). If a number covers the whole business rather than the filter, say so clearly.",
    "- If the data is insufficient, say exactly what is missing (e.g. 'אין מכירות לפני מרץ') and suggest importing it (העלאת נתונים).",
    "- You can only read data. You cannot create, edit or delete anything. If an action would help (e.g. follow-up tasks), say the user can do it with the buttons below your answer — nothing is changed until the user confirms.",
    filtersPrompt(filters, stages),
  ]
    .filter(Boolean)
    .join("\n");
}

export async function runAnalyst(
  supabase: SupabaseClient,
  org: { id: string; name: string; business_type: string; currency: string; terms?: unknown },
  history: AnalystMessage[],
  workspaceFilters: WorkspaceFilters = EMPTY_FILTERS,
): Promise<AnalystResponse> {
  const ctx: ToolContext = { supabase, orgId: org.id, currency: org.currency, actions: [], toolsUsed: [] };
  const terms = resolveTerms(org.terms);
  const stages = await toolStages(ctx);
  const openai = getOpenAI();
  const question = history.filter((m) => m.role === "user").at(-1)?.content ?? "";
  // Structured filters win; a legacy note inside the question ("(התמקד ב: …)") fills the gaps.
  const legacy = parseQuestionContext(question);
  const filters: WorkspaceFilters = {
    service: workspaceFilters.service ?? legacy.service,
    range: workspaceFilters.range ?? legacy.range,
    stage: workspaceFilters.stage ?? legacy.stage,
  };

  if (!openai) return fallbackAnalyst(legacy.question, ctx, AI_UNAVAILABLE_NOTICE, filters, terms);

  const messages: ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt(org.name, org.business_type, org.currency, filters, stages, terms) },
    ...history
      .slice(-ANALYST_MAX_MESSAGES)
      .map((m) => ({ role: m.role, content: m.content.slice(0, ANALYST_MAX_MESSAGE_CHARS) }) as ChatCompletionMessageParam),
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
          answer: msg.content?.trim() || "לא מצאתי תשובה לשאלה הזו בנתונים שלך.",
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
            content = JSON.stringify({ error: "לא ניתן היה לטעון את הנתונים האלה." });
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
    return fallbackAnalyst(legacy.question, ctx, AI_FAILED_NOTICE, filters, terms);
  }
}

// ---------------------------------------------------------------------------
// Deterministic analyst: answers the most common questions (Hebrew or English)
// from the same data when OpenAI is not configured or fails. Every number comes
// from the database; answers are written in Hebrew.
// ---------------------------------------------------------------------------

export type Intent =
  | "revenue_change"
  | "revenue"
  | "top_service"
  | "top_customers"
  | "attention"
  | "followup"
  | "repeat"
  | "tasks"
  | "deal_risk"
  | "pipeline"
  | "overview";

/** Context keywords used by the canvas filter note appended to questions (Hebrew or English). */
const CONTEXT_WORDS = /(התמקד|focus|שירות|service|מוצר|product|התקופה|period|שלב|stage|סינון|filter)/i;
const QUOTED_SERVICE =
  /(?:service(?:\/product)?|product|שירות(?:\/(?:ה)?מוצר)?|מוצר)[^"“”״\n]{0,14}["“”״]([^"“”״\n]{1,120})["“”״]/i;
const COLON_SERVICE = /(?:service|שירות)\s*[:：]\s*([^\n,.()"“”״]{1,120})/i;

/**
 * Splits a question into the user's words and the filter context the canvas adds
 * (e.g. `… (התמקד ב: רק השירות/המוצר "ניקוי עמוק".)` or a "שירות: X" line).
 */
export function parseQuestionContext(raw: string): {
  question: string;
  service: string | null;
  range: RangePreset | null;
  stage: DealStage | null;
} {
  let service: string | null = null;
  let range: RangePreset | null = null;
  let stage: DealStage | null = null;
  const contexts: string[] = [];
  let question = raw.replace(/\(([^()]*)\)/g, (match, inner: string) => {
    if (!CONTEXT_WORDS.test(inner)) return match;
    contexts.push(inner);
    return " ";
  });
  const lines = question.split("\n");
  if (lines.length > 1) {
    const kept: string[] = [];
    for (const line of lines) {
      if (/^\s*(?:הקשר|context|התמקד|focus|סינון|filters?|שירות\s*:|service\s*:)/i.test(line)) contexts.push(line);
      else kept.push(line);
    }
    question = kept.join("\n");
  }
  for (const c of contexts) {
    const m = c.match(QUOTED_SERVICE) ?? c.match(COLON_SERVICE);
    if (!service && m?.[1]?.trim()) service = m[1].trim();
    if (!range) range = (Object.keys(RANGE_PRESETS) as RangePreset[]).find((k) => c.includes(RANGE_PRESETS[k])) ?? null;
    if (!stage) stage = DEAL_STAGES.find((k) => c.includes(`בשלב "${STAGE_NAMES[k]}"`)) ?? null;
  }
  return { question: question.replace(/\s+/g, " ").trim(), service, range, stage };
}

/** Maps the business's own nouns back to the built-in ones so the intent rules below keep working. */
function normalizeTerms(q: string, t?: Terms) {
  if (!t) return q;
  const pairs: [string, string][] = (["customers", "customer", "deals", "deal", "services", "service", "sales", "sale"] as const)
    .map((k) => [t[k], DEFAULT_TERMS[k]] as [string, string])
    .filter(([own, def]) => own && own !== def)
    .sort((a, b) => b[0].length - a[0].length);
  return pairs.reduce((s, [own, def]) => s.split(own).join(def), q);
}

export function classifyIntent(q: string, terms?: Terms): Intent {
  const s = normalizeTerms(q, terms).toLowerCase();
  if (
    /(deal|pipeline|opportunit).*(risk|stall|stuck|attention|quiet)|at risk.*deal|stuck|stalled|עסק(אות|ה).*(סיכון|תקוע|נתקע|לא זז|שקט)|תקועות|תקועה/.test(s)
  )
    return "deal_risk";
  if (
    /(why|what).*(revenue|sales|income).*(down|drop|decreas|fall|low|up|increas|chang)|what changed|(revenue|sales) (down|drop)|למה.*(הכנס|מכירות|כסף|ירד|עלה|עלו)|מה השתנה|מה קרה|(הכנסות|מכירות).*(ירדו|ירידה|עלו|עלייה|השתנו|השתנה)/.test(
      s,
    )
  )
    return "revenue_change";
  if (
    /(service|product).*(best|top|most|profitab|popular|sell)|(best|top|most profitable|most popular|best.?selling).*(service|product)|(שירות|מוצר).*(הכי|רווחי|מוביל|פופולרי|נמכר|מכניס)|(הכי|רווחי|מכניס).*(שירות|מוצר)/.test(
      s,
    )
  )
    return "top_service";
  if (/\btasks?\b|to-?do|משימ/.test(s)) return "tasks";
  if (
    /follow.?up|call back|reach out|who should i (call|contact)|who to (call|contact)|למי.*(לחזור|להתקשר|לפנות|לדבר)|מי.*לחזור|לחזור ל|להתקשר|לפנות ל/.test(s)
  )
    return "followup";
  if (
    /attention|haven'?t (purchased|bought|returned|come back)|inactive|churn|at risk|lapsed|leav|lost customers|not (come|came) back|בסיכון|סיכון|לעזוב|עוזבים|עזבו|נטשו|נוטשים|נטישה|לא חזרו|לא קנו|לא הגיעו|תשומת לב|לא פעילים|רדומים/.test(
      s,
    )
  )
    return "attention";
  if (/repeat|returning|come back|loyal|regulars|retention|חוזרים|קבועים|נאמנים|חזרו לקנות/.test(s)) return "repeat";
  if (/(top|best|most valuable|biggest|vip).*(customer|client)|(לקוחות|לקוח).*(הכי|מובילים|מוביל|טובים|גדולים|שווים|חשובים)/.test(s))
    return "top_customers";
  if (/pipeline|deals|stage|עסקאות|עסקה|משפך|בתהליך/.test(s)) return "pipeline";
  if (/revenue|sales|income|earn|made|make|money|how much|turnover|הכנס|כסף|מכירות|מכרתי|הרווחתי|רווח|מחזור|כמה עשיתי/.test(s)) return "revenue";
  return "overview";
}

const pct = (cur: number, prev: number) => (prev ? Math.round(((cur - prev) / Math.abs(prev)) * 100) : null);
const n = (v: number) => formatNumber(v);
const NEXT = "**מה כדאי לעשות:**";

async function fallbackAnalyst(question: string, ctx: ToolContext, notice: string, filters: WorkspaceFilters, t: Terms = DEFAULT_TERMS): Promise<AnalystResponse> {
  const money = (v: number) => formatCurrency(v, ctx.currency);
  /** "3 מטופלים" / "מטופל אחד" — counts of customers in the business's own word. */
  const pc = (count: number) => plural(count, t.customer, t.customers);
  const { service, range, stage } = filters;
  const intent = classifyIntent(question, t);
  /** Selected period (or the given default) with its Hebrew "in the period" phrase. */
  const period = (fallback: RangePreset) => {
    const preset = range ?? fallback;
    return { ...resolveRange(preset), preset, inText: IN_PERIOD[preset] };
  };
  /** Shown when the answer does not depend on the selected period. */
  const rangeNote = range
    ? `התשובה מבוססת על קצב הקנייה של כל ${t.customer}, ולכן היא לא מוגבלת לתקופה שנבחרה (${RANGE_PRESETS[range]}).`
    : null;
  const lines: string[] = [];
  const { supabase, orgId } = ctx;
  const svcText = service ? ` משירות "${service}"` : "";
  const used = (tool: string) => ctx.toolsUsed.push(tool);
  const action = (a: AnalystAction) => {
    if (!ctx.actions.some((x) => x.type === a.type && x.label === a.label)) ctx.actions.push(a);
  };

  /** Customers who bought the filtered service (null when no service filter). */
  const serviceCustomers = async () => {
    if (!service) return null;
    used("get_revenue_by_service");
    return getServiceCustomers(supabase, orgId, service);
  };

  type Overview = {
    record_counts: Record<string, number>;
    revenue_last_12_months: number;
    revenue_previous_12_months: number;
    revenue_last_full_month: number;
    customers: { total: number; active: number; new_30d: number };
  };

  try {
    if (intent === "revenue_change") {
      const months = lastTwoFullMonths();
      // A selected range (other than "all time") is compared with the same-length period before it.
      const sel = range && range !== "all" ? resolveRange(range) : null;
      const m = sel
        ? {
            current: { ...sel, label: IN_PERIOD[range!] },
            previous: { ...previousPeriod(sel.from, sel.to), label: "בתקופה המקבילה שלפניה" },
          }
        : {
            current: { ...months.current, label: `ב${months.current.label}` },
            previous: { ...months.previous, label: `ב${months.previous.label}` },
          };
      if (range === "all") lines.push("אי אפשר להשוות את כל התקופה לתקופה קודמת, ולכן השוויתי את החודש המלא האחרון לחודש שלפניו.", "");
      if (service) {
        used("compare_periods");
        const [cur, prev] = await Promise.all([
          getRevenueSummaryFiltered(supabase, orgId, m.current.from, m.current.to, "previous_period", service),
          getRevenueSummaryFiltered(supabase, orgId, m.previous.from, m.previous.to, "previous_period", service),
        ]);
        if (!cur.total && !prev.total) {
          lines.push(`לא מצאתי הכנסות${svcText} ${m.previous.label} או ${m.current.label}.`);
        } else {
          const change = pct(cur.total, prev.total);
          const diff = cur.total - prev.total;
          lines.push(
            `ההכנסות${svcText} ${m.current.label} היו **${money(cur.total)}**, ${diff < 0 ? "ירידה" : "עלייה"} של **${change === null ? "—" : `${Math.abs(change)}%`}** לעומת ${money(prev.total)} ${m.previous.label}.`,
            "",
            `- מספר המכירות: ${n(prev.tx_count)} ${m.previous.label}, ${n(cur.tx_count)} ${m.current.label}.`,
            `- לקוחות שקנו את השירות: ${n(prev.customers)} ${m.previous.label}, ${n(cur.customers)} ${m.current.label}.`,
          );
          if (diff < 0) lines.push("", `${NEXT} פנה ללקוחות שקנו את "${service}" בעבר ולא חזרו ${m.current.label}.`);
        }
      } else {
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
          lines.push(`לא מצאתי הכנסות ${m.previous.label} או ${m.current.label}. העלה את קובץ המכירות שלך ואוכל להשוות בין התקופות.`);
        } else {
          const change = pct(c.current_total, c.previous_total);
          const diff = c.current_total - c.previous_total;
          lines.push(
            `ההכנסות ${m.current.label} היו **${money(c.current_total)}**, ${diff < 0 ? "ירידה" : "עלייה"} של **${change === null ? "—" : `${Math.abs(change)}%`}** לעומת ${money(c.previous_total)} ${m.previous.label} (${diff < 0 ? "−" : "+"}${money(Math.abs(diff))}).`,
          );
          const drivers: string[] = [];
          if (c.lost_customers > 0)
            drivers.push(
              `**${pc(c.lost_customers)}** שקנו ${m.previous.label} לא קנו ${m.current.label} — ${m.previous.label} הם הוציאו יחד **${money(c.lost_customers_revenue)}**.`,
            );
          if (c.new_customers > 0)
            drivers.push(`${plural(c.new_customers, "לקוח חדש", "לקוחות חדשים")} ${c.new_customers === 1 ? "הכניס" : "הכניסו"} ${money(c.new_customers_revenue)}.`);
          if (Math.abs(c.retained_revenue_change) > 0)
            drivers.push(
              `לקוחות שקנו בשני החודשים הוציאו ${money(Math.abs(c.retained_revenue_change))} ${c.retained_revenue_change < 0 ? "פחות" : "יותר"}.`,
            );
          if (c.previous_tx) drivers.push(`מספר המכירות השתנה מ-${n(c.previous_tx)} ל-${n(c.current_tx)}.`);
          const svc = [...c.services].sort((a, b) => (diff < 0 ? a.change - b.change : b.change - a.change))[0];
          if (svc && Math.sign(svc.change) === Math.sign(diff) && svc.change !== 0)
            drivers.push(`השינוי הגדול ביותר היה בשירות **${svc.service}** (${svc.change < 0 ? "−" : "+"}${money(Math.abs(svc.change))}).`);
          if (overdue.count > 0)
            drivers.push(`${plural(overdue.count, "לקוח קבוע", "לקוחות קבועים")} עוד לא ${overdue.count === 1 ? "חזר" : "חזרו"} בזמן הרגיל.`);
          if (drivers.length) {
            lines.push("", diff < 0 ? "הסיבות האפשריות:" : "מה השפיע:");
            lines.push(...drivers.map((d) => `- ${d}`));
          }
          if (c.top_lapsed_customers.length && diff < 0) {
            lines.push(
              "",
              `הלקוחות הגדולים שלא חזרו: ${c.top_lapsed_customers
                .slice(0, 3)
                .map((x) => `${x.name} (${money(x.revenue_in_previous_period)})`)
                .join(", ")}.`,
            );
            lines.push("", `${NEXT} התקשר קודם ל${c.top_lapsed_customers[0].name} ובדוק למה לא חזר.`);
          }
        }
      }
    } else if (intent === "revenue" && range) {
      used("get_revenue_trend");
      const p = period(range);
      const cur = await getRevenueSummaryFiltered(supabase, orgId, p.from, p.to, "previous_period", service);
      if (!cur.total && !cur.compare_total) {
        lines.push(`לא מצאתי הכנסות${svcText} ${p.inText}.`);
      } else {
        lines.push(`${p.inText} הכנסת **${money(cur.total)}**${svcText}.`);
        const bullets: string[] = [];
        const change = range === "all" ? null : pct(cur.total, cur.compare_total);
        if (change !== null)
          bullets.push(
            change === 0
              ? `זה בדיוק כמו בתקופה המקבילה שלפניה (${money(cur.compare_total)}).`
              : `זו ${change < 0 ? "ירידה" : "עלייה"} של **${Math.abs(change)}%** לעומת התקופה המקבילה שלפניה (${money(cur.compare_total)}).`,
          );
        if (cur.tx_count) bullets.push(`${plural(cur.tx_count, "מכירה", "מכירות", "מכירה אחת")}, ${plural(cur.customers, "לקוח משלם", "לקוחות משלמים")}.`);
        if (bullets.length) lines.push("", ...bullets.map((b) => `- ${b}`));
        if (change !== null && change < 0)
          lines.push("", `${NEXT} בדוק אילו לקוחות קבועים עוד לא חזרו — שאל "למי כדאי לחזור השבוע?".`);
      }
    } else if (intent === "revenue") {
      used("get_revenue_trend");
      const mtd = monthToDate();
      const full = lastTwoFullMonths();
      const [cur, prev, last] = await Promise.all([
        getRevenueSummaryFiltered(supabase, orgId, mtd.current.from, mtd.current.to, "previous_period", service),
        getRevenueSummaryFiltered(supabase, orgId, mtd.previous.from, mtd.previous.to, "previous_period", service),
        getRevenueSummaryFiltered(supabase, orgId, full.current.from, full.current.to, "previous_period", service),
      ]);
      if (!cur.total && !prev.total && !last.total) {
        lines.push(
          service
            ? `לא מצאתי הכנסות${svcText} בחודשים האחרונים.`
            : "לא מצאתי הכנסות בחודשים האחרונים. העלה את קובץ המכירות שלך ואוכל לנתח אותו.",
        );
      } else {
        lines.push(`מתחילת החודש הכנסת **${money(cur.total)}**${svcText}.`);
        const change = pct(cur.total, prev.total);
        const bullets: string[] = [];
        if (change !== null)
          bullets.push(
            change === 0
              ? `זה בדיוק כמו באותם ימים בחודש שעבר (${money(prev.total)}).`
              : `זו ${change < 0 ? "ירידה" : "עלייה"} של **${Math.abs(change)}%** לעומת אותם ימים בחודש שעבר (${money(prev.total)}).`,
          );
        if (cur.tx_count) bullets.push(`${plural(cur.tx_count, "מכירה", "מכירות", "מכירה אחת")}, ${plural(cur.customers, "לקוח משלם", "לקוחות משלמים")}.`);
        bullets.push(`ב${full.current.label} כולו הכנסת ${money(last.total)}${svcText}.`);
        lines.push("", ...bullets.map((b) => `- ${b}`));
        if (change !== null && change < 0)
          lines.push("", `${NEXT} בדוק אילו לקוחות קבועים עוד לא חזרו החודש — שאל "למי כדאי לחזור השבוע?".`);
      }
    } else if (intent === "top_service") {
      used("get_revenue_by_service");
      const p = period("12m");
      const rows = await getRevenueByService(supabase, orgId, p.from, p.to, 50);
      if (!rows.length) lines.push(`לא מצאתי מכירות לפי שירות ${p.inText}. העלה מכירות שכוללות את שם השירות ואוכל לדרג אותם.`);
      else if (service) {
        const idx = rows.findIndex((r) => r.name.toLowerCase() === service.toLowerCase());
        if (idx < 0) lines.push(`לא מצאתי מכירות של השירות "${service}" ${p.inText}.`);
        else {
          const r = rows[idx];
          lines.push(
            `השירות "${r.name}" הכניס **${money(r.revenue)}** ${p.inText} (${plural(r.tx_count, "מכירה", "מכירות", "מכירה אחת")}) — מקום ${idx + 1} מתוך ${n(rows.length)} שירותים.`,
          );
          if (idx > 0) lines.push("", `- השירות המוביל הוא **${rows[0].name}** עם ${money(rows[0].revenue)}.`);
        }
      } else {
        const top = rows[0];
        lines.push(
          `השירות שהכניס הכי הרבה ${p.inText} הוא **${top.name}** — **${money(top.revenue)}** (${plural(top.tx_count, "מכירה", "מכירות", "מכירה אחת")}).`,
          "",
          ...rows.slice(0, 5).map((r, i) => `- ${i + 1}. **${r.name}** — ${money(r.revenue)}`),
          "",
          "החישוב לפי הכנסות. אין לי נתוני עלויות, ולכן אני לא יכול לחשב רווח נקי.",
          "",
          `${NEXT} הצע את "${top.name}" ללקוחות שעוד לא ניסו אותו.`,
        );
      }
    } else if (intent === "tasks") {
      used("get_tasks");
      const { data, error } = await supabase
        .from("tasks")
        .select("id, title, due_date, customers(name)")
        .eq("organization_id", orgId)
        .eq("status", "open")
        .order("due_date", { ascending: true, nullsFirst: false })
        .limit(200);
      if (error) throw error;
      type Row = { title: string; due_date: string | null; customers: { name: string } | { name: string }[] | null };
      const rows = (data ?? []) as unknown as Row[];
      const today = israelToday();
      const weekDay = israelNow();
      weekDay.setDate(weekDay.getDate() + 7);
      const week = isoDate(weekDay);
      const overdue = rows.filter((t) => t.due_date && t.due_date < today);
      const dueToday = rows.filter((t) => t.due_date === today);
      const thisWeek = rows.filter((t) => t.due_date && t.due_date > today && t.due_date <= week);
      if (!rows.length) {
        lines.push("אין לך משימות פתוחות כרגע.", "", `${NEXT} שאל "למי כדאי לחזור השבוע?" כדי ליצור משימות מעקב ללקוחות.`);
      } else {
        lines.push(
          `יש לך **${plural(rows.length, "משימה פתוחה", "משימות פתוחות", "משימה פתוחה אחת")}**: ${n(overdue.length)} באיחור, ${n(dueToday.length)} להיום ו-${n(thisWeek.length)} בשבוע הקרוב.`,
        );
        const list = [...overdue, ...dueToday, ...thisWeek].slice(0, 6);
        if (list.length) {
          lines.push(
            "",
            ...list.map((t) => {
              const c = Array.isArray(t.customers) ? t.customers[0] : t.customers;
              return `- **${t.title}**${c?.name ? ` — ${c.name}` : ""} · יעד ${dmy(t.due_date)}${t.due_date && t.due_date < today ? " (באיחור)" : ""}`;
            }),
          );
        }
        if (overdue.length) lines.push("", `${NEXT} התחל מהמשימות שבאיחור — הכי ותיקה: "${overdue[0].title}".`);
      }
    } else if (intent === "followup" || intent === "attention") {
      used("get_overdue_regulars");
      used("get_customers_at_risk");
      const [svc, overdueAll, riskAll] = await Promise.all([
        serviceCustomers(),
        getOverdueCustomers(supabase, orgId, 1.5, 200),
        getCustomersAtRisk(supabase, orgId, 60, 30, 200),
      ]);
      const ids = svc ? new Set(svc.map((c) => c.customer_id)) : null;
      const overdue = ids ? overdueAll.filter((c) => ids.has(c.id)) : overdueAll;
      const risk = ids ? riskAll.filter((c) => ids.has(c.id)) : riskAll;
      const scope = service ? ` מבין לקוחות השירות "${service}"` : "";
      const reason = (c: (typeof risk)[number]) =>
        c.change_pct !== null && c.reason !== "inactive"
          ? `ההכנסות ממנו ירדו ב-${Math.abs(Math.round(c.change_pct))}%, פעילות אחרונה לפני ${n(c.days_since)} ימים`
          : `אין פעילות כבר ${n(c.days_since)} ימים`;

      if (!overdue.length && !risk.length) {
        lines.push(
          intent === "followup"
            ? `אין כרגע ${t.customers} שצריך לחזור אליהם בדחיפות${scope} — הקבועים בקצב הרגיל שלהם.`
            : `חדשות טובות — אין כרגע ${t.customers} בסיכון${scope} לפי היסטוריית הקניות.`,
        );
      } else if (intent === "followup") {
        const targets = overdue.length ? [...overdue].sort((a, b) => b.total_revenue - a.total_revenue) : [];
        if (targets.length) {
          lines.push(`השבוע כדאי לחזור ל-**${pc(targets.length)}**${scope} שבדרך כלל כבר היו חוזרים:`, "");
          lines.push(
            ...targets
              .slice(0, 6)
              .map((c) => `- **${c.name}** — בדרך כלל כל ${n(c.median_interval_days)} ימים, קנה לאחרונה לפני ${n(c.days_since)} ימים`),
          );
          const extra = risk.filter((r) => !targets.some((t) => t.id === r.id));
          if (extra.length) lines.push("", `בנוסף, ${pc(extra.length)} בסיכון: ${extra.slice(0, 3).map((c) => c.name).join(", ")}.`);
          lines.push("", `${NEXT} התקשר קודם ל${targets[0].name} — הוא הכי משמעותי ברשימה.`);
          action({ type: "view_customers", label: `הצג ${t.customers} שלא חזרו`, customerIds: targets.map((c) => c.id), title: `${t.customers} שכדאי לחזור אליהם` });
          action({ type: "create_tasks", label: "צור משימות מעקב", customerIds: targets.map((c) => c.id), taskTitle: `לחזור ל${t.customer}` });
        } else {
          const top = [...risk].sort((a, b) => b.total_revenue - a.total_revenue);
          lines.push(`כדאי לחזור ל-**${pc(top.length)} בסיכון**${scope}:`, "");
          lines.push(...top.slice(0, 6).map((c) => `- **${c.name}** — ${reason(c)}`));
          lines.push("", `${NEXT} התקשר קודם ל${top[0].name}.`);
          action({ type: "view_customers", label: `הצג ${t.customers} בסיכון`, customerIds: top.map((c) => c.id), title: `${t.customers} בסיכון` });
          action({ type: "create_tasks", label: "צור משימות מעקב", customerIds: top.map((c) => c.id), taskTitle: `לחזור ל${t.customer}` });
        }
      } else {
        lines.push(
          `מצאתי **${pc(risk.length)} בסיכון** ו-**${plural(overdue.length, "לקוח קבוע", "לקוחות קבועים")}** שעבר זמן החזרה הרגיל שלהם${scope}.`,
        );
        if (risk.length) {
          lines.push("", "בסיכון הכי גבוה:");
          lines.push(...risk.slice(0, 5).map((c) => `- **${c.name}** — ${reason(c)}`));
          action({ type: "view_customers", label: `הצג ${t.customers} בסיכון`, customerIds: risk.map((c) => c.id), title: `${t.customers} בסיכון` });
        }
        if (overdue.length) {
          lines.push("", "בדרך כלל כבר היו חוזרים:");
          lines.push(
            ...overdue
              .slice(0, 4)
              .map((c) => `- **${c.name}** — בדרך כלל כל ${n(c.median_interval_days)} ימים, קנה לאחרונה לפני ${n(c.days_since)} ימים`),
          );
          action({ type: "view_customers", label: `הצג ${t.customers} שלא חזרו`, customerIds: overdue.map((c) => c.id), title: `${t.customers} קבועים שלא חזרו` });
        }
        const callIds = [...new Set([...risk, ...overdue].map((c) => c.id))];
        action({ type: "create_tasks", label: "צור משימות מעקב", customerIds: callIds, taskTitle: `לחזור ל${t.customer}` });
        lines.push("", `${NEXT} צור משימות מעקב והתקשר השבוע ל${(risk[0] ?? overdue[0]).name}.`);
      }
      if (rangeNote) lines.push("", rangeNote);
    } else if (intent === "repeat") {
      used("get_overdue_regulars");
      if (service) {
        const svc = (await serviceCustomers()) ?? [];
        const repeat = svc.filter((c) => c.purchases >= 2).length;
        if (!svc.length) lines.push(`לא מצאתי לקוחות שקנו את השירות "${service}".`);
        else
          lines.push(
            `**${n(repeat)} מתוך ${pc(svc.length)}** (${Math.round((repeat / svc.length) * 100)}%) קנו את "${service}" יותר מפעם אחת.`,
            "",
            `${NEXT} שלח הודעה ללקוחות שקנו את השירות רק פעם אחת והזמן אותם לחזור.`,
          );
      } else {
        const r = await getRepeatStats(supabase, orgId, 1.5);
        if (!r.buyers) lines.push("עדיין אין מספיק מכירות כדי לחשב לקוחות חוזרים. העלה את קובץ המכירות שלך.");
        else {
          const rate = Math.round((r.repeat / r.buyers) * 100);
          lines.push(`**${n(r.repeat)} מתוך ${pc(r.buyers)}** (${rate}%) קנו יותר מפעם אחת.`, "");
          if (r.avg_purchases_repeat) lines.push(`- לקוח חוזר קונה בממוצע ${Math.round(r.avg_purchases_repeat * 10) / 10} פעמים.`);
          lines.push(`- ${plural(r.first_time, "לקוח קנה", "לקוחות קנו", "לקוח אחד קנה")} רק פעם אחת.`);
          if (r.overdue) lines.push(`- ${plural(r.overdue, "לקוח קבוע", "לקוחות קבועים")} עוד לא ${r.overdue === 1 ? "חזר" : "חזרו"} בזמן הרגיל.`);
          lines.push("", `${NEXT} שלח הודעה ללקוחות שקנו פעם אחת בלבד והזמן אותם לחזור.`);
        }
      }
      if (rangeNote) lines.push("", rangeNote);
    } else if (intent === "top_customers") {
      used("get_top_customers");
      const topPeriod = period("12m");
      let rows: { id: string; name: string; revenue: number; purchases: number }[];
      if (service) {
        const svc = ((await serviceCustomers()) ?? []).sort((a, b) => b.revenue - a.revenue).slice(0, 10);
        const { data, error } = svc.length
          ? await supabase.from("customers").select("id, name").eq("organization_id", orgId).in("id", svc.map((c) => c.customer_id))
          : { data: [] as { id: string; name: string }[], error: null };
        if (error) throw error;
        const names = new Map(((data ?? []) as { id: string; name: string }[]).map((c) => [c.id, c.name]));
        rows = svc.map((c) => ({ id: c.customer_id, name: names.get(c.customer_id) ?? "—", revenue: c.revenue, purchases: c.purchases }));
      } else {
        rows = await getTopCustomers(supabase, orgId, topPeriod.from, topPeriod.to, 10);
      }
      if (!rows.length)
        lines.push(
          service ? `לא מצאתי לקוחות שקנו את השירות "${service}".` : `לא מצאתי הכנסות ${topPeriod.inText}. העלה את קובץ המכירות כדי לדרג את הלקוחות.`,
        );
      else {
        const total = rows.reduce((s, r) => s + r.revenue, 0);
        lines.push(
          service
            ? `${rows.length === 1 ? "הלקוח המוביל" : `${n(rows.length)} הלקוחות המובילים`}${svcText} ${rows.length === 1 ? "הכניס" : "הכניסו"} **${money(total)}**:`
            : `${rows.length === 1 ? "הלקוח המוביל שלך" : `${n(rows.length)} הלקוחות המובילים שלך`} ${topPeriod.inText} ${rows.length === 1 ? "הכניס" : "הכניסו"} **${money(total)}**:`,
          "",
        );
        lines.push(...rows.slice(0, 8).map((r, i) => `- ${i + 1}. **${r.name}** — ${money(r.revenue)}, ${plural(r.purchases, "קנייה", "קניות", "קנייה אחת")}`));
        if (service && range) lines.push("", `הדירוג לפי כל הקניות של השירות, לא רק ${topPeriod.inText}.`);
        lines.push("", `${NEXT} תודה אישית או הטבה קטנה ל${rows[0].name} תחזק את הקשר.`);
        action({ type: "view_customers", label: `הצג ${t.customers} מובילים`, customerIds: rows.map((r) => r.id), title: `${t.customers} מובילים` });
      }
    } else if (intent === "deal_risk") {
      used("get_deals_at_risk");
      const all = await getDealsAtRisk(supabase, orgId, 14, 200);
      const deals = stage ? all.filter((d) => d.stage === stage) : all;
      const scope = stage ? ` בשלב "${stageLabel(stage, ctx.stages)}"` : "";
      const total = deals.reduce((s, d) => s + d.value, 0);
      if (!deals.length) lines.push(`אין כרגע עסקאות פתוחות${scope} שנראות תקועות.`);
      else {
        lines.push(
          `**${plural(deals.length, "עסקה פתוחה", "עסקאות פתוחות", "עסקה פתוחה אחת")}**${scope} בשווי **${money(total)}** ${deals.length === 1 ? "צריכה" : "צריכות"} תשומת לב:`,
          "",
        );
        lines.push(
          ...deals.slice(0, 6).map((d) => `- **${d.name}** — ${money(d.value)}, שלב: ${stageLabel(d.stage, ctx.stages)}, ללא פעילות ${n(d.days_idle)} ימים`),
        );
        lines.push("", `${NEXT} צור משימות מעקב וחזור קודם ל"${deals[0].name}".`);
        action({
          type: "create_tasks",
          label: deals.length === 1 ? `צור משימת מעקב ל${t.deal}` : `צור משימות מעקב ל-${deals.length} ${t.deals}`,
          dealIds: deals.map((d) => d.id),
          taskTitle: `מעקב אחרי ה${t.deal}`,
        });
      }
    } else if (intent === "pipeline") {
      const rows = (await runAnalystTool("get_pipeline_summary", {}, ctx)) as { stage: string; deals: number; value: number; stage_kind: string }[];
      const open = rows.filter((r) => r.stage_kind === "open");
      const openValue = open.reduce((s, r) => s + r.value, 0);
      const openCount = open.reduce((s, r) => s + r.deals, 0);
      const inStage = stage ? rows.find((r) => r.stage === stage) : null;
      if (!rows.some((r) => r.deals)) lines.push(`עדיין אין ${t.deals} בתהליך.`);
      else if (stage) {
        lines.push(
          inStage?.deals
            ? `בשלב "${stageLabel(stage, ctx.stages)}" יש **${plural(inStage.deals, "עסקה", "עסקאות", "עסקה אחת")}** בשווי **${money(inStage.value)}**.`
            : `אין כרגע עסקאות בשלב "${stageLabel(stage, ctx.stages)}".`,
          "",
          `סך הכל ${plural(openCount, "עסקה פתוחה", "עסקאות פתוחות", "עסקה פתוחה אחת")} בשווי ${money(openValue)}.`,
        );
      } else {
        lines.push(`יש לך **${plural(openCount, "עסקה פתוחה", "עסקאות פתוחות", "עסקה פתוחה אחת")}** בשווי כולל של **${money(openValue)}**:`, "");
        lines.push(...rows.filter((r) => r.deals).map((r) => `- ${stageLabel(r.stage, ctx.stages)}: ${plural(r.deals, "עסקה", "עסקאות", "עסקה אחת")}, ${money(r.value)}`));
      }
    } else {
      const p = period("12m");
      const [o, filteredRevenue] = await Promise.all([
        runAnalystTool("get_business_overview", {}, ctx) as Promise<Overview>,
        range || service ? getRevenueSummaryFiltered(supabase, orgId, p.from, p.to, "previous_period", service) : Promise.resolve(null),
      ]);
      const change = pct(o.revenue_last_12_months, o.revenue_previous_12_months);
      if (!o.record_counts.customers && !o.record_counts.transactions)
        lines.push("עדיין אין נתוני עסק במערכת. העלה קובץ CSV או Excel ואנתח אותו בשבילך.");
      else {
        lines.push(
          `תמונת מצב: **${pc(o.customers.total)}** (${n(o.customers.active)} פעילים ב-90 הימים האחרונים, ${n(o.customers.new_30d)} חדשים בחודש האחרון) ו-**${money(o.revenue_last_12_months)}** הכנסות ב-12 החודשים האחרונים${change !== null ? ` (${change > 0 ? "+" : ""}${change}% לעומת השנה הקודמת)` : ""}.`,
          "",
          ...(range || service
            ? [`- ${period("12m").inText} ההכנסות${svcText} היו **${money(filteredRevenue?.total ?? 0)}**.`, ""]
            : []),
          `אפשר לשאול למשל: “כמה הכנסתי החודש?”, “אילו ${t.customers} עלולים לעזוב?”, “מה מכניס הכי הרבה?” או “למי כדאי לחזור השבוע?”`,
        );
      }
    }
  } catch {
    return {
      answer: "לא הצלחתי לטעון את הנתונים שלך כרגע. נסה שוב בעוד רגע.",
      actions: [],
      toolsUsed: [],
      aiUsed: false,
      notice,
    };
  }

  return { answer: lines.join("\n"), actions: ctx.actions, toolsUsed: [...new Set(ctx.toolsUsed)], aiUsed: false, notice };
}
