import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { formatCurrency, isoDate } from "@/lib/utils";
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
    ? { period: "this month so far", comparison: "the same days last month" }
    : {
        period: `in ${lastTwoFullMonths(now).current.label}`,
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
  if (!f.hasData) return "Import your business data and your daily brief will appear here.";
  const money = (n: number) => formatCurrency(n, currency);
  const parts: string[] = [];
  if (f.revenueChangePct !== null) {
    const dir = f.revenueChangePct >= 0 ? "up" : "down";
    parts.push(
      `Revenue ${f.periodLabel} is ${dir} ${Math.abs(f.revenueChangePct)}% compared with ${f.comparisonLabel} (${money(f.revenue)} vs ${money(f.previousRevenue)}).`,
    );
  } else if (f.revenue) {
    parts.push(`Revenue ${f.periodLabel} is ${money(f.revenue)}.`);
  }
  if (f.overdueRegulars) {
    parts.push(
      `${parts.length ? "However, " : ""}${f.overdueRegulars} returning customers have not purchased within their normal purchase interval.`,
    );
  }
  if (f.highValueAtRisk.length) parts.push(`${f.highValueAtRisk.length} high-value customers require attention.`);
  if (f.dealsAtRisk) parts.push(`${f.dealsAtRisk} open deals worth ${money(f.dealsAtRiskValue)} have gone quiet.`);
  if (f.overdueTasks) parts.push(`You have ${f.overdueTasks} overdue tasks.`);
  if (!parts.length) parts.push("Everything looks steady — no customers or deals currently need attention.");
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
            "Write a short daily business brief (2–4 short paragraphs, max 70 words total) for a small business owner. " +
            "Use ONLY the facts given; do not add numbers. Plain sentences, no headings, no bullet points, no greetings. " +
            `Currency is ${currency}. Lead with revenue, then what needs attention.`,
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
  const today = isoDate(new Date());
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
