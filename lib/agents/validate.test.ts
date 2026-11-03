import { describe, expect, it } from "vitest";
import { cleanAction, cleanAnswer, cleanInsights, type KnownRecords } from "./validate";

const C1 = "11111111-1111-4111-8111-111111111111";
const C2 = "22222222-2222-4222-8222-222222222222";
const D1 = "33333333-3333-4333-8333-333333333333";
const FAKE = "99999999-9999-4999-8999-999999999999";
const known: KnownRecords = { customers: new Set([C1, C2]), phones: new Set([C1]), deals: new Set([D1]) };

describe("agent actions", () => {
  it("keeps a task on a real deal and fills its title from the label", () => {
    expect(cleanAction({ type: "create_task", label: "לחזור לדנה", deal_id: D1 }, known)).toEqual({
      type: "create_task", label: "לחזור לדנה", text: "לחזור לדנה", customer_id: null, deal_id: D1,
    });
  });
  it("drops an invented id", () => {
    expect(cleanAction({ type: "create_task", label: "x", text: "x", customer_id: FAKE }, known)).toBeNull();
    expect(cleanAction({ type: "create_task", label: "x", text: "x", deal_id: "not-a-uuid" }, known)).toBeNull();
  });
  it("drops an unknown action type, view or recipe", () => {
    expect(cleanAction({ type: "delete_customer", label: "x", customer_id: C1 }, known)).toBeNull();
    expect(cleanAction({ type: "open_view", label: "x", view: "admin" }, known)).toBeNull();
    expect(cleanAction({ type: "create_flow", label: "x", recipe: "spam_everyone" }, known)).toBeNull();
  });
  it("only prepares WhatsApp for a customer with a phone", () => {
    expect(cleanAction({ type: "prepare_whatsapp", label: "x", text: "היי", customer_id: C1 }, known)).not.toBeNull();
    expect(cleanAction({ type: "prepare_whatsapp", label: "x", text: "היי", customer_id: C2 }, known)).toBeNull();
  });
  it("strips fields that don't belong to the type", () => {
    expect(cleanAction({ type: "open_view", label: "הצג", view: "stuck_deals", recipe: "stuck_deal", deal_id: D1 }, known)).toEqual({
      type: "open_view", label: "הצג", view: "stuck_deals",
    });
  });
});

describe("insights", () => {
  it("keeps valid insights, counts dropped actions and bad items", () => {
    const { insights, dropped } = cleanInsights(
      [
        { headline: "182 עסקאות תקועות", detail: "", severity: "critical", evidence: [{ label: "עסקאות", value: 182 }],
          actions: [{ type: "open_view", label: "הצג", view: "stuck_deals" }, { type: "create_task", label: "x", customer_id: FAKE }] },
        { headline: "", severity: "info" },
        { headline: "x", severity: "panic" },
      ],
      known,
    );
    expect(insights).toHaveLength(1);
    expect(insights[0].evidence[0]).toEqual({ label: "עסקאות", value: "182" });
    expect(insights[0].detail).toBeNull();
    expect(insights[0].actions).toHaveLength(1);
    expect(dropped).toBe(3);
  });
  it("returns nothing for garbage", () => {
    expect(cleanInsights("oops", known)).toEqual({ insights: [], dropped: 0 });
  });
});

describe("brain answer", () => {
  it("keeps sources that point at real records only", () => {
    const a = cleanAnswer(
      { answer: "דנה קנתה פעמיים", confidence: "high",
        sources: [{ type: "customer", id: C1, label: "דנה" }, { type: "customer", id: FAKE, label: "מומצא" }, { type: "metric", label: "הכנסות" }] },
      known,
    );
    expect(a?.sources.map((s) => s.label)).toEqual(["דנה", "הכנסות"]);
  });
  it("rejects an empty answer", () => {
    expect(cleanAnswer({ answer: "  ", confidence: "low" }, known)).toBeNull();
  });
});
