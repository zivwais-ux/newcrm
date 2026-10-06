import { describe, expect, it } from "vitest";
import { israelDay, israelNow, israelToday, resolveRange } from "./dates";

describe("Israel business day", () => {
  it("rolls over at midnight Israel time, not UTC", () => {
    // 22:30 UTC on 4 Oct = 01:30 on 5 Oct in Israel (IDT, UTC+3)
    expect(israelToday(new Date("2026-10-04T22:30:00Z"))).toBe("2026-10-05");
    // 20:30 UTC on 4 Oct = 23:30 on 4 Oct in Israel
    expect(israelToday(new Date("2026-10-04T20:30:00Z"))).toBe("2026-10-04");
  });

  it("handles winter time (UTC+2)", () => {
    expect(israelToday(new Date("2026-12-31T22:30:00Z"))).toBe("2027-01-01");
    expect(israelDay(new Date("2026-12-15T10:00:00Z"))).toEqual({
      ymd: "2026-12-15",
      start: "2026-12-14T22:00:00.000Z",
      end: "2026-12-15T22:00:00.000Z",
    });
  });

  it("day bounds follow summer time", () => {
    const d = israelDay(new Date("2026-07-01T12:00:00Z"));
    expect(d.start).toBe("2026-06-30T21:00:00.000Z");
  });

  it("ranges start from the Israeli date", () => {
    const now = israelNow(new Date("2026-10-31T22:30:00Z")); // 1 Nov 01:30 in Israel
    expect(resolveRange("30d", now)).toEqual({ from: "2026-10-03", to: "2026-11-01" });
    expect(resolveRange("ytd", now).from).toBe("2026-01-01");
  });
});
