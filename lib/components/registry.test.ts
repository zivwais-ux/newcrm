import { describe, expect, it } from "vitest";
import { COMPONENT_REGISTRY, recommend, resolveConfig, topRecommendations, getDefinition } from "./registry";
import type { DataCounts } from "@/types/domain";

const empty: DataCounts = { customers: 0, transactions: 0, services: 0, leads: 0, deals: 0, activities: 0, tasks: 0 };

describe("component registry", () => {
  it("has unique ids", () => {
    const ids = COMPONENT_REGISTRY.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("recommends the Phase 1 service set after a sales import", () => {
    const counts = { ...empty, customers: 520, transactions: 1400, services: 12 };
    const ids = topRecommendations("service", counts, new Set()).map((r) => r.definition.id).sort();
    expect(ids).toEqual(["ai-analyst", "customer-hub", "customer-risk", "repeat-customers", "revenue-intelligence"]);
  });

  it("recommends sales components for a sales business with deals", () => {
    const counts = { ...empty, customers: 200, deals: 60, leads: 120, transactions: 800 };
    const ids = topRecommendations("sales", counts, new Set()).map((r) => r.definition.id);
    expect(ids).toContain("sales-pipeline");
    expect(ids).toContain("deal-risk");
    expect(ids).toContain("followup-radar");
    expect(ids).not.toContain("repeat-customers");
  });

  it("never hides components, only ranks them", () => {
    expect(recommend("service", empty, new Set())).toHaveLength(COMPONENT_REGISTRY.length);
  });

  it("excludes installed components", () => {
    expect(recommend("both", empty, new Set(["customer-hub"])).some((r) => r.definition.id === "customer-hub")).toBe(false);
  });

  it("fills config defaults and rejects invalid values", () => {
    const def = getDefinition("customer-risk")!;
    expect(resolveConfig(def, { threshold: "90", drop: "nope" })).toEqual({ threshold: "90", drop: "30", size: "md", w: "6" });
  });
});
