import { describe, expect, it } from "vitest";
import { classifyIntent } from "./analyst";
import { templateBrief, type BriefFacts } from "@/lib/analytics/brief";

describe("analyst intent classification (fallback engine)", () => {
  it.each([
    ["Why is revenue down?", "revenue_change"],
    ["Why are sales down?", "revenue_change"],
    ["What changed this month?", "revenue_change"],
    ["Who are my top customers?", "top_customers"],
    ["Who are my most valuable customers?", "top_customers"],
    ["Which customers haven't purchased recently?", "attention"],
    ["Which customers need attention?", "attention"],
    ["Which deals are at risk?", "deal_risk"],
    ["Show me the pipeline", "pipeline"],
    ["Hello", "overview"],
    ["למה ההכנסות ירדו?", "revenue_change"],
  ])("%s → %s", (q, intent) => {
    expect(classifyIntent(q)).toBe(intent);
  });
});

describe("template brief", () => {
  const facts: BriefFacts = {
    hasData: true,
    periodLabel: "in September",
    comparisonLabel: "August",
    revenue: 108000,
    previousRevenue: 100000,
    revenueChangePct: 8,
    overdueRegulars: 12,
    highValueAtRisk: [
      { id: "a", name: "A", avgTicket: 1 },
      { id: "b", name: "B", avgTicket: 1 },
      { id: "c", name: "C", avgTicket: 1 },
    ],
    atRiskCount: 20,
    dealsAtRisk: 0,
    dealsAtRiskValue: 0,
    overdueTasks: 0,
  };
  it("states facts from data", () => {
    const text = templateBrief(facts, "ILS");
    expect(text).toContain("up 8%");
    expect(text).toContain("12 returning customers");
    expect(text).toContain("3 high-value customers");
  });
  it("handles empty workspaces", () => {
    expect(templateBrief({ ...facts, hasData: false }, "ILS")).toMatch(/Import your business data/);
  });
});
