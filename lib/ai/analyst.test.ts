import { describe, expect, it } from "vitest";
import { classifyIntent, parseQuestionContext } from "./analyst";
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
    ["How much did I make this month?", "revenue"],
    ["Which service is the most profitable?", "top_service"],
    ["Who should I follow up with?", "followup"],
    ["How many repeat customers do I have?", "repeat"],
    ["Show my overdue tasks", "tasks"],
    ["Hello", "overview"],
  ])("%s → %s", (q, intent) => {
    expect(classifyIntent(q)).toBe(intent);
  });

  it.each([
    ["למה ההכנסות ירדו?", "revenue_change"],
    ["למה המכירות ירדו החודש?", "revenue_change"],
    ["מה השתנה החודש?", "revenue_change"],
    ["כמה הכנסתי החודש?", "revenue"],
    ["כמה כסף עשיתי?", "revenue"],
    ["איך המכירות שלי?", "revenue"],
    ["מה השירות הכי רווחי?", "top_service"],
    ["איזה מוצר הכי נמכר?", "top_service"],
    ["אילו לקוחות עלולים לעזוב?", "attention"],
    ["אילו לקוחות בסיכון?", "attention"],
    ["מי הלקוחות שנטשו?", "attention"],
    ["אילו לקוחות עזבו?", "attention"],
    ["למי כדאי לחזור השבוע?", "followup"],
    ["למי להתקשר היום?", "followup"],
    ["כמה לקוחות חוזרים יש לי?", "repeat"],
    ["מי הלקוחות הכי טובים שלי?", "top_customers"],
    ["אילו עסקאות תקועות?", "deal_risk"],
    ["אילו עסקאות בסיכון?", "deal_risk"],
    ["תראה לי את העסקאות", "pipeline"],
    ["מה המשימות שלי להיום?", "tasks"],
    ["שלום", "overview"],
  ])("Hebrew: %s → %s", (q, intent) => {
    expect(classifyIntent(q)).toBe(intent);
  });
});

describe("question context (canvas filters)", () => {
  it("extracts the Hebrew service filter and strips the context note", () => {
    const r = parseQuestionContext('כמה הכנסתי החודש? (התמקד ב: רק השירות/המוצר "ניקוי עמוק", התקופה: 30 הימים האחרונים.)');
    expect(r.service).toBe("ניקוי עמוק");
    expect(r.question).toBe("כמה הכנסתי החודש?");
    expect(classifyIntent(r.question)).toBe("revenue");
  });
  it("extracts the English service filter", () => {
    const r = parseQuestionContext('Who are my top customers? (Focus on only the service/product "Deep Clean".)');
    expect(r.service).toBe("Deep Clean");
    expect(classifyIntent(r.question)).toBe("top_customers");
  });
  it("reads a 'שירות:' context line", () => {
    const r = parseQuestionContext("שירות: תספורת\nאילו לקוחות עלולים לעזוב?");
    expect(r.service).toBe("תספורת");
    expect(r.question).toBe("אילו לקוחות עלולים לעזוב?");
  });
  it("does not treat a stage-only context as a pipeline question", () => {
    const r = parseQuestionContext('כמה הכנסתי? (התמקד ב: עסקאות בשלב "הצעת מחיר".)');
    expect(r.service).toBeNull();
    expect(classifyIntent(r.question)).toBe("revenue");
  });
  it("leaves plain questions alone", () => {
    expect(parseQuestionContext("מה השירות הכי רווחי?")).toEqual({ question: "מה השירות הכי רווחי?", service: null });
  });
});

describe("template brief", () => {
  const facts: BriefFacts = {
    hasData: true,
    periodLabel: "בספטמבר",
    comparisonLabel: "אוגוסט",
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
  it("states facts from data in Hebrew", () => {
    const text = templateBrief(facts, "ILS");
    expect(text).toContain("ההכנסות בספטמבר עלו ב-8% לעומת אוגוסט");
    expect(text).toContain("₪108,000");
    expect(text).toContain("12 לקוחות קבועים עוד לא חזרו");
    expect(text).toContain("3 לקוחות חשובים צריכים תשומת לב");
  });
  it("uses singular forms for one", () => {
    const text = templateBrief(
      { ...facts, revenueChangePct: -5, overdueRegulars: 1, highValueAtRisk: [facts.highValueAtRisk[0]], dealsAtRisk: 1, dealsAtRiskValue: 500, overdueTasks: 1 },
      "ILS",
    );
    expect(text).toContain("ירדו ב-5%");
    expect(text).toContain("לקוח קבוע אחד עוד לא חזר");
    expect(text).toContain("לקוח חשוב אחד צריך תשומת לב");
    expect(text).toContain("עסקה פתוחה אחת בשווי ₪500 לא זזה");
    expect(text).toContain("משימה אחת באיחור");
  });
  it("handles empty workspaces", () => {
    expect(templateBrief({ ...facts, hasData: false }, "ILS")).toMatch(/העלה את נתוני העסק/);
  });
});
