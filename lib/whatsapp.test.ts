import { describe, expect, it } from "vitest";
import { fillTemplate, toWhatsAppNumber, whatsAppLink } from "./whatsapp";

describe("toWhatsAppNumber", () => {
  it.each([
    ["050-123-4567", "972501234567"],
    ["0501234567", "972501234567"],
    ["+972 50 123 4567", "972501234567"],
    ["+972-050-1234567", "972501234567"],
    ["972501234567", "972501234567"],
    ["00972501234567", "972501234567"],
    ["501234567", "972501234567"],
    ["+44 7700 900123", "447700900123"],
  ])("%s → %s", (input, out) => expect(toWhatsAppNumber(input)).toBe(out));

  it.each(["", null, "123", "abc", "03-1234"])("rejects %s", (input) => expect(toWhatsAppNumber(input)).toBeNull());
});

describe("fillTemplate", () => {
  it("uses the first name and business", () => {
    expect(fillTemplate("היי {שם}, תודה שבחרת ב{עסק}", { name: "דנה כהן", business: "סטודיו נקי" })).toBe("היי דנה, תודה שבחרת בסטודיו נקי");
  });
  it("falls back gracefully", () => {
    expect(fillTemplate("על {שירות}", {})).toBe("על השירות");
  });
});

describe("whatsAppLink", () => {
  it("encodes Hebrew text", () => {
    expect(whatsAppLink("050-1234567", "היי")).toBe("https://wa.me/972501234567?text=%D7%94%D7%99%D7%99");
  });
  it("returns null without a phone", () => expect(whatsAppLink(null)).toBeNull());
});
