import "server-only";
import { israelToday } from "@/lib/analytics/dates";
import type { SupabaseClient } from "@supabase/supabase-js";
import { formatCurrency, isoDate, plural } from "@/lib/utils";
import { lastTwoFullMonths, monthToDate } from "./dates";
import { getCustomersAtRisk, getDataCounts, getDealsAtRisk, getOverdueCustomers, getRevenueSummary } from "./queries";
import { aiModel, getOpenAI } from "@/lib/ai/openai";

export interface BriefFacts {
  hasData: boolean;
  periodLabel: string;
  comparisonLabel: string;
  revenue: number;
  previousRevenue: number;
  revenueChangePct: number | null;
  overdueRegulars: number;
  highValueAtRisk: { id: string; name: string; avgTicket: number }[];
  atRiskCount: number;
  dealsAtRisk: number;
  dealsAtRiskValue: number;
  overdueTasks: number;
}

export interface Brief {
  text: string;
  facts: BriefFacts;
  aiUsed: boolean;
  generatedAt: string;
}

/** Computes the facts behind the brief. All numbers come from the database. */
export async function computeBriefFacts(supabase: SupabaseClient, orgId: string): Promise<BriefFacts> {
  const now = new Date();
  const useMtd = now.getDate() >= 10;
  const periods = useMtd ? monthToDate(now) : lastTwoFullMonths(now);
  const labels = useMtd
    ? { period: "מתחילת החודש", comparison: "אותם ימים בחודש שעבר" }
    : {
        period: `ב${lastTwoFullMonths(now).current.label}`,
        comparison: lastTwoFullMonths(now).previous.label,
      };

  const counts = await getDataCounts(supabase, orgId);
  const empty: BriefFacts = {
    hasData: false,
    periodLabel: labels.period,
    comparisonLabel: labels.comparison,
    revenue: 0,
    previousRevenue: 0,
    revenueChangePct: null,
    overdueRegulars: 0,
    highValueAtRisk: [],
    atRiskCount: 0,
    dealsAtRisk: 0,
    dealsAtRiskValue: 0,
    overdueTasks: 0,
  };
  if (!counts.transactions && !counts.deals && !counts.customers) return empty;

  const [summary, overdue, risk, deals, tasks] = await Promise.all([
    counts.transactions
      ? getRevenueSummary(supabase, orgId, periods.current.from, periods.current.to, "previous_period")
      : Promise.resolve(null),
    counts.transactions ? getOverdueCustomers(supabase, orgId, 1.5, 200) : Promise.resolve([]),
    counts.transactions ? getCustomersAtRisk(supabase, orgId, 60, 30, 200) : Promise.resolve([]),
    counts.deals ? getDealsAtRisk(supabase, orgId, 14, 200) : Promise.resolve([]),
    supabase
      .from("tasks")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", orgId)
      .eq("status", "open")
      .lt("due_date", isoDate(now)),
  ]);

  // Previous-period revenue for the exact comparison window.
  let previousRevenue = 0;
  if (counts.transactions) {
    const prev = await getRevenueSummary(supabase, orgId, periods.previous.from, periods.previous.to, "previous_period");
    previousRevenue = prev.total;
  }
  const revenue = summary?.total ?? 0;

  // "High value" = average purchase in the top quartile of at-risk customers.
  const tickets = risk.map((r) => r.avg_ticket).sort((a, b) => a - b);
  const q3 = tickets.length ? tickets[Math.floor(tickets.length * 0.75)] : 0;
  const highValue = risk
    .filter((r) => r.avg_ticket >= q3 && r.avg_ticket > 0)
    .sort((a, b) => b.total_revenue - a.total_revenue)
    .slice(0, 5);

  return {
    hasData: true,
    periodLabel: labels.period,
    comparisonLabel: labels.comparison,
    revenue,
    previousRevenue,
    revenueChangePct: previousRevenue ? Math.round(((revenue - previousRevenue) / Math.abs(previousRevenue)) * 100) : null,
    overdueRegulars: overdue.length,
    highValueAtRisk: highValue.map((r) => ({ id: r.id, name: r.name, avgTicket: r.avg_ticket })),
    atRiskCount: risk.length,
    dealsAtRisk: deals.length,
    dealsAtRiskValue: deals.reduce((s, d) => s + d.value, 0),
    overdueTasks: tasks.count ?? 0,
  };
}

export function templateBrief(f: BriefFacts, currency: string): string {
  if (!f.hasData) return "העלה את נתוני העסק שלך, והסיכום היומי יופיע כאן.";
  const money = (n: number) => formatCurrency(n, currency);
  const parts: string[] = [];
  if (f.revenueChangePct !== null) {
    if (f.revenueChangePct === 0) {
      parts.push(`ההכנסות ${f.periodLabel} יציבות לעומת ${f.comparisonLabel}: ${money(f.revenue)}.`);
    } else {
      const dir = f.revenueChangePct > 0 ? "עלו" : "ירדו";
      parts.push(
        `ההכנסות ${f.periodLabel} ${dir} ב-${Math.abs(f.revenueChangePct)}% לעומת ${f.comparisonLabel} (${money(f.revenue)} לעומת ${money(f.previousRevenue)}).`,
      );
    }
  } else if (f.revenue) {
    parts.push(`ההכנסות ${f.periodLabel}: ${money(f.revenue)}.`);
  }
  if (f.overdueRegulars) {
    const one = f.overdueRegulars === 1;
    parts.push(
      `${parts.length ? "עם זאת, " : ""}${plural(f.overdueRegulars, "לקוח קבוע", "לקוחות קבועים")} עוד לא ${one ? "חזר" : "חזרו"} בזמן שבו ${one ? "הוא חוזר" : "הם חוזרים"} בדרך כלל.`,
    );
  }
  if (f.highValueAtRisk.length) {
    const one = f.highValueAtRisk.length === 1;
    parts.push(`${plural(f.highValueAtRisk.length, "לקוח חשוב", "לקוחות חשובים")} ${one ? "צריך" : "צריכים"} תשומת לב.`);
  }
  if (f.dealsAtRisk) {
    const one = f.dealsAtRisk === 1;
    parts.push(
      `${plural(f.dealsAtRisk, "עסקה פתוחה", "עסקאות פתוחות", "עסקה פתוחה אחת")} בשווי ${money(f.dealsAtRiskValue)} ${one ? "לא זזה" : "לא זזו"} לאחרונה.`,
    );
  }
  if (f.overdueTasks) parts.push(`יש לך ${plural(f.overdueTasks, "משימה", "משימות", "משימה אחת")} באיחור.`);
  if (!parts.length) parts.push("הכל נראה יציב — אין כרגע לקוחות או עסקאות שדורשים תשומת לב.");
  return parts.join("\n\n");
}

async function aiBrief(f: BriefFacts, orgName: string, currency: string): Promise<string | null> {
  const openai = getOpenAI();
  if (!openai || !f.hasData) return null;
  try {
    const completion = await openai.chat.completions.create({
      model: aiModel(),
      temperature: 0.3,
      max_completion_tokens: 220,
      messages: [
        {
          role: "system",
          content:
            "Write a short daily business brief IN HEBREW (2–4 short paragraphs, max 70 words total) for an Israeli small-business owner. " +
            "Use clear, simple, everyday Hebrew with no jargon or English words. " +
            "Use ONLY the facts given; do not add numbers. Plain sentences, no headings, no bullet points, no greetings. " +
            `Currency is ${currency}; format money like ₪1,250 and percentages like 12%. Use correct Hebrew singular/plural forms. ` +
            "Lead with revenue, then what needs attention, and finish with one short concrete suggestion when relevant.",
        },
        { role: "user", content: `Business: ${orgName}\nFacts: ${JSON.stringify(f)}` },
      ],
    });
    return completion.choices[0]?.message?.content?.trim() || null;
  } catch (error) {
    console.error("[ai] brief failed", (error as Error).message);
    return null;
  }
}

/** Returns today's brief, generating and caching it once per org per day. */
export async function getBrief(
  supabase: SupabaseClient,
  org: { id: string; name: string; currency: string },
  { refresh = false } = {},
): Promise<Brief> {
  const today = israelToday();
  if (!refresh) {
    const { data } = await supabase
      .from("ai_briefs")
      .select("content")
      .eq("organization_id", org.id)
      .eq("brief_date", today)
      .maybeSingle();
    if (data?.content) return data.content as Brief;
  }
  const facts = await computeBriefFacts(supabase, org.id);
  const text = (await aiBrief(facts, org.name, org.currency)) ?? templateBrief(facts, org.currency);
  const brief: Brief = { text, facts, aiUsed: text !== templateBrief(facts, org.currency), generatedAt: new Date().toISOString() };
  if (facts.hasData) {
    await supabase.from("ai_briefs").upsert({ organization_id: org.id, brief_date: today, content: brief });
  }
  return brief;
}
