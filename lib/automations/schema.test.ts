import { describe, expect, it } from "vitest";
import { resolveTerms } from "@/lib/terms";
import { automationSchema, subjectOf } from "./schema";
import { describeAutomation } from "./describe";
import { RECIPES } from "./recipes";

describe("automations", () => {
  it("every recipe is a valid automation, in the default and in custom words", () => {
    for (const terms of [resolveTerms({}), resolveTerms({ customer: "מטופל", appointment: "טיפול", deal: "הצעת מחיר" })]) {
      for (const r of RECIPES) {
        const parsed = automationSchema.safeParse(r.build(terms));
        expect(parsed.success, `${r.key}: ${parsed.success ? "" : parsed.error.issues[0]?.message}`).toBe(true);
      }
    }
  });

  it("rejects conditions that don't fit the subject and unknown values", () => {
    const base = RECIPES[0].build(resolveTerms({}));
    expect(automationSchema.safeParse({ ...base, conditions: [{ field: "stage", op: "eq", value: "won" }] }).success).toBe(false);
    expect(automationSchema.safeParse({ ...base, conditions: [{ field: "drop table", op: "eq", value: "x" }] }).success).toBe(false);
    expect(automationSchema.safeParse({ ...base, actions: [] }).success).toBe(false);
  });

  it("reads as a Hebrew sentence in the business's words", () => {
    const t = resolveTerms({ appointment: "טיפול" });
    const reminder = RECIPES.find((r) => r.key === "appointment_reminder")!.build(t);
    const text = describeAutomation(automationSchema.parse(reminder), { terms: t });
    expect(text).toContain("יום אחד לפני הטיפול");
    expect(text).toContain("ויש לו טלפון");
    expect(text).toContain("אז הכן הודעת WhatsApp לשליחה");
  });

  it("knows the record each trigger runs on", () => {
    expect(subjectOf({ type: "deal_stage", stage: "won" })).toBe("deals");
    expect(subjectOf({ type: "days_from_date", anchor: "last_purchase", days: 30, before: false })).toBe("customers");
  });
});
