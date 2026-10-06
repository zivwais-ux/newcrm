import { describe, expect, it } from "vitest";
import { extractDate, parseCommand } from "./parse";

// Tuesday 6 Oct 2026, 09:00 Israel time (local getters = Israel wall clock).
const now = new Date(2026, 9, 6, 9, 0, 0);
const modules = [
  { id: "revenue-intelligence", name: "הכנסות" },
  { id: "repeat-customers", name: "לקוחות חוזרים" },
  { id: "today", name: "היום" },
];

describe("parseCommand", () => {
  it("reads a quick sale with amount, name and service", () => {
    expect(parseCommand("מכירה 250 לדנה כהן על תספורת", modules, now)).toEqual({
      kind: "sale",
      amount: 250,
      name: "דנה כהן",
      service: "תספורת",
    });
    expect(parseCommand("מכירה לדנה 1,200 ₪", modules, now)).toMatchObject({ kind: "sale", amount: 1200, name: "דנה" });
    expect(parseCommand("מכירה", modules, now)).toEqual({ kind: "sale", amount: null, name: null, service: null });
  });

  it("reads an appointment with relative day and time", () => {
    expect(parseCommand("תור לדנה מחר ב-10", modules, now)).toEqual({
      kind: "appointment",
      name: "דנה",
      date: "2026-10-07",
      time: "10:00",
      service: null,
    });
    expect(parseCommand("פגישה עם יוסי ביום ראשון בשעה 16:30", modules, now)).toMatchObject({
      name: "יוסי",
      date: "2026-10-11",
      time: "16:30",
    });
    expect(parseCommand("תור לרון היום ב-3", modules, now)).toMatchObject({ date: "2026-10-06", time: "15:00" });
  });

  it("reads a new customer with phone", () => {
    expect(parseCommand("לקוח חדש יוסי לוי 050-123-4567", modules, now)).toEqual({
      kind: "customer",
      name: "יוסי לוי",
      phone: "0501234567",
    });
  });

  it("reads a task with a date", () => {
    expect(parseCommand("משימה להתקשר לרוני מחר", modules, now)).toEqual({ kind: "task", title: "להתקשר לרוני", date: "2026-10-07" });
    expect(parseCommand("להתקשר לספק ביום חמישי", modules, now)).toEqual({ kind: "task", title: "להתקשר לספק", date: "2026-10-08" });
  });

  it("opens pages and adds modules", () => {
    expect(parseCommand("לקוחות", modules, now)).toMatchObject({ kind: "open", href: "/customers" });
    expect(parseCommand("פתח הגדרות", modules, now)).toMatchObject({ kind: "open", href: "/settings" });
    expect(parseCommand("הוסף מודול הכנסות", modules, now)).toEqual({ kind: "add-module", id: "revenue-intelligence", name: "הכנסות" });
    expect(parseCommand("הוסף לקוחות חוזרים", modules, now)).toMatchObject({ kind: "add-module", id: "repeat-customers" });
  });

  it("routes questions to the advisor and everything else to search", () => {
    expect(parseCommand("כמה הרווחתי החודש", modules, now)).toEqual({ kind: "ask", question: "כמה הרווחתי החודש" });
    expect(parseCommand("למה ההכנסות ירדו?", modules, now).kind).toBe("ask");
    expect(parseCommand("דנה כהן", modules, now)).toEqual({ kind: "search", query: "דנה כהן" });
  });
});

describe("extractDate", () => {
  it("handles explicit day/month and rolls past dates to next year", () => {
    expect(extractDate("ב-15/10", now).date).toBe("2026-10-15");
    expect(extractDate("1.3", now).date).toBe("2027-03-01");
    expect(extractDate("ביום שלישי", now).date).toBe("2026-10-13");
  });
});
