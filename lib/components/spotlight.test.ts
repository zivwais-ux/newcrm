import { describe, expect, it } from "vitest";
import { revenueValue, summarizeTransactions } from "./spotlight";

const tx = (amount: number, date: string, status = "paid", type = "sale") =>
  ({ amount, date, status, type, product_or_service: null }) as Parameters<typeof summarizeTransactions>[0][number];

describe("spotlight revenue (mirrors SQL revenue_value)", () => {
  it("counts only paid sales and subtracts refunds once", () => {
    expect(revenueValue(tx(100, "2026-01-01"))).toBe(100);
    expect(revenueValue(tx(100, "2026-01-01", "pending"))).toBe(0);
    expect(revenueValue(tx(100, "2026-01-01", "cancelled"))).toBe(0);
    expect(revenueValue(tx(100, "2026-01-01", "refunded"))).toBe(0);
    expect(revenueValue(tx(40, "2026-01-01", "refunded", "refund"))).toBe(-40);
    expect(revenueValue(tx(40, "2026-01-01", "cancelled", "refund"))).toBe(0);
  });

  it("summarizes purchases as distinct paid-sale days, newest first", () => {
    const s = summarizeTransactions(
      [
        tx(50, "2026-03-01", "pending"),
        tx(30, "2026-02-20", "refunded", "refund"),
        tx(100, "2026-02-10"),
        tx(100, "2026-02-10"),
        tx(100, "2026-01-31"),
      ],
      "2026-03-02",
    );
    expect(s.totalRevenue).toBe(270);
    expect(s.purchases).toBe(2);
    expect(s.lastPurchase).toBe("2026-02-10");
    expect(s.daysSinceLastPurchase).toBe(20);
    expect(s.usualInterval).toBe(10);
    expect(s.recent).toHaveLength(3);
  });
});
