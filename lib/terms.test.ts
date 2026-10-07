import { describe, expect, it } from "vitest";
import { DEFAULT_TERMS, TERM_GROUPS, TERM_KEYS, appointmentWords, compactTerms, resolveTerms, withTerms } from "./terms";

describe("terms", () => {
  it("falls back to defaults for missing or invalid values", () => {
    expect(resolveTerms(null)).toEqual(DEFAULT_TERMS);
    expect(resolveTerms({ customer: "  מטופל ", appointment: "", service: 5 })).toMatchObject({
      customer: "מטופל",
      appointment: "תור",
      service: "שירות",
    });
  });

  it("stores only what differs from the defaults", () => {
    expect(compactTerms({ customer: "לקוח", customers: "מטופלים", appointment: " " })).toEqual({ customers: "מטופלים" });
  });

  it("fills placeholders", () => {
    const t = resolveTerms({ appointment: "טיפול" });
    expect(withTerms("{appointment} חדש ל{customer}", t)).toBe("טיפול חדש ללקוח");
    expect(withTerms("{unknown}", t)).toBe("{unknown}");
  });

  it("knows appointment words including the business's own", () => {
    expect(appointmentWords(resolveTerms({ appointment: "סשן" }))).toContain("סשן");
  });

  it("every group covers real term keys", () => {
    for (const g of TERM_GROUPS) {
      expect(TERM_KEYS).toContain(g.singular);
      expect(TERM_KEYS).toContain(g.plural);
      expect(g.suggestions.length).toBeGreaterThan(2);
    }
  });
});
