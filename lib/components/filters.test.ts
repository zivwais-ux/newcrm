import { describe, expect, it } from "vitest";
import { activeFilterKeys, describeFilters, filterLabel, parseFilters } from "./filters";
import { getDefinition, resolveConfig } from "./registry";

describe("workspace filters", () => {
  it("parses valid values and drops invalid ones", () => {
    expect(parseFilters({ range: "90d", service: " Deep Clean ", stage: "proposal" })).toEqual({
      range: "90d",
      service: "Deep Clean",
      stage: "proposal",
    });
    expect(parseFilters(new URLSearchParams("range=forever&stage=hacked&service="))).toEqual({ range: null, service: null, stage: null });
  });

  it("lists active keys and describes them for the analyst", () => {
    const f = parseFilters({ service: "Deep Clean", range: "90d" });
    expect(activeFilterKeys(f)).toEqual(["range", "service"]);
    expect(describeFilters(f)).toContain('"Deep Clean"');
    expect(describeFilters(f)).toContain("התמקד ב");
    expect(describeFilters(f)).toContain("90 הימים האחרונים");
    expect(describeFilters(parseFilters({ stage: "proposal" }))).toContain('"הצעת מחיר"');
    expect(describeFilters(parseFilters({}))).toBeNull();
    expect(filterLabel("service", "Deep Clean")).toBe("שירות: Deep Clean");
    expect(filterLabel("stage", "won")).toBe("שלב: נסגרה בהצלחה");
  });
});

describe("canvas widths", () => {
  it("maps legacy sizes and accepts explicit widths", () => {
    const def = getDefinition("customer-risk")!;
    expect(resolveConfig(def, null).w).toBe("6");
    expect(resolveConfig(def, { size: "lg" }).w).toBe("12");
    expect(resolveConfig(def, { w: "8" }).w).toBe("8");
    expect(resolveConfig(def, { w: "7" }).w).toBe("6");
  });

  it("every component declares how it links to others", () => {
    for (const id of ["revenue-intelligence", "sales-pipeline", "tasks"]) {
      const def = getDefinition(id)!;
      expect(Array.isArray(def.consumes) && Array.isArray(def.emits)).toBe(true);
    }
    expect(getDefinition("revenue-intelligence")!.emits).toContain("service");
    expect(getDefinition("customer-hub")!.consumes).toContain("service");
  });
});
