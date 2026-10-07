import { describe, expect, it } from "vitest";
import { suggestMappings } from "./heuristics";
import { detectEntities, type ColumnMapping } from "./canonical-schema";
import { parseDate, parseMoney, normalizePhone, inferDateOrder } from "./values";
import { validateRows } from "./validate";
import { buildBundle } from "./transform";

const headers = ["Customer Name", "Phone", "Purchase Date", "Amount", "Service", "Sales Rep"];
const rows = [
  { "Customer Name": "David Cohen", Phone: "050-1234567", "Purchase Date": "14/03/2025", Amount: "₪1,200", Service: "Deep Clean", "Sales Rep": "Noa" },
  { "Customer Name": "Maya Levi", Phone: "052-7654321", "Purchase Date": "02/04/2025", Amount: "350", Service: "Window Cleaning", "Sales Rep": "Avi" },
  { "Customer Name": "David Cohen", Phone: "050-1234567", "Purchase Date": "20/04/2025", Amount: "1100", Service: "Deep Clean", "Sales Rep": "Noa" },
  { "Customer Name": "", Phone: "054-0000000", "Purchase Date": "21/04/2025", Amount: "200", Service: "Office Cleaning", "Sales Rep": "Avi" },
  { "Customer Name": "Maya Levi", Phone: "052-7654321", "Purchase Date": "02/04/2025", Amount: "350", Service: "Window Cleaning", "Sales Rep": "Avi" },
  { "Customer Name": "Tom Bar", Phone: "", "Purchase Date": "not a date", Amount: "abc", Service: "Deep Clean", "Sales Rep": "" },
];

describe("values", () => {
  it("parses money in many formats", () => {
    expect(parseMoney("₪1,200.50")).toBe(1200.5);
    expect(parseMoney("$ 300")).toBe(300);
    expect(parseMoney("(150)")).toBe(-150);
    expect(parseMoney("1.234,56")).toBe(1234.56);
    expect(parseMoney("abc")).toBeNull();
    expect(parseMoney(42)).toBe(42);
  });

  it("parses dates (day-first default, ISO, Excel serial)", () => {
    expect(parseDate("14/03/2025")).toBe("2025-03-14");
    expect(parseDate("03/14/2025", "mdy")).toBe("2025-03-14");
    expect(parseDate("2025-03-14")).toBe("2025-03-14");
    expect(parseDate("45730")).toBe("2025-03-14");
    expect(parseDate("31/02/2025")).toBeNull();
    expect(parseDate(new Date("2025-01-05T00:00:00Z"))).toBe("2025-01-05");
  });

  it("infers month-first order when obvious", () => {
    expect(inferDateOrder(["03/14/2025", "04/20/2025"])).toBe("mdy");
    expect(inferDateOrder(["14/03/2025"])).toBe("dmy");
  });

  it("normalizes phones", () => {
    expect(normalizePhone("050-123-4567")).toBe("0501234567");
    expect(normalizePhone("+972 50 123 4567")).toBe("+972501234567");
    expect(normalizePhone("12")).toBeNull();
  });
});

describe("heuristic mapping", () => {
  it("maps the classic sales sheet with high confidence", () => {
    const m = suggestMappings(headers, rows);
    const by = Object.fromEntries(m.map((x) => [x.column, x]));
    expect(by["Customer Name"].target).toBe("customer.name");
    expect(by["Phone"].target).toBe("customer.phone");
    expect(by["Purchase Date"].target).toBe("transaction.date");
    expect(by["Amount"].target).toBe("transaction.amount");
    expect(by["Service"].target).toBe("transaction.product_or_service");
    expect(by["Sales Rep"].target).toBe("transaction.owner");
    expect(by["Amount"].confidence).toBeGreaterThan(0.85);
  });

  it("detects email columns from values even with unknown header", () => {
    const m = suggestMappings(["Contact info"], [{ "Contact info": "a@b.com" }, { "Contact info": "c@d.co.il" }]);
    expect(m[0].target).toBe("customer.email");
  });

  it("maps Hebrew headers", () => {
    const m = suggestMappings(["שם לקוח", "סכום", "תאריך"], [{ "שם לקוח": "דני", "סכום": "100", "תאריך": "01/02/2025" }]);
    expect(m.map((x) => x.target)).toEqual(["customer.name", "transaction.amount", "transaction.date"]);
  });

  it("keeps unknown columns as custom fields", () => {
    const m = suggestMappings(["Favourite colour"], [{ "Favourite colour": "blue" }]);
    expect(m[0].target).toBe("custom");
  });
});

describe("validation and transform", () => {
  const mapping = suggestMappings(headers, rows);

  it("detects customers, transactions and services", () => {
    expect(detectEntities(mapping).sort()).toEqual(["customer", "service", "transaction"]);
  });

  it("counts valid rows, duplicates and issues", () => {
    const v = validateRows(rows, mapping);
    expect(v.total).toBe(6);
    expect(v.valid).toBe(3);
    expect(v.duplicates).toBe(1);
    expect(v.issueCounts.missing_customer_name).toBe(1);
    expect(v.issueCounts.invalid_amount).toBe(1);
    expect(v.issueCounts.invalid_date).toBe(1);
    expect(v.blockers).toEqual([]);
  });

  it("merges repeated customers and derives services", () => {
    const v = validateRows(rows, mapping);
    const b = buildBundle(v.validRecords);
    expect(b.customers.map((c) => c.name)).toEqual(["David Cohen", "Maya Levi"]);
    expect(b.transactions).toHaveLength(3);
    expect(b.transactions[2].customerIndex).toBe(0);
    expect(b.services.find((s) => s.name === "Deep Clean")?.price).toBe(1150);
    expect(b.transactions[0].owner_name).toBe("Noa");
  });

  it("blocks imports with nothing mapped", () => {
    const none: ColumnMapping[] = headers.map((column) => ({ column, target: "ignore", confidence: 1, source: "user" }));
    expect(validateRows(rows, none).blockers.length).toBeGreaterThan(0);
  });

  it("imports leads when lead fields are mapped", () => {
    const leadMapping: ColumnMapping[] = [
      { column: "Name", target: "customer.name", confidence: 1, source: "user" },
      { column: "Source", target: "lead.source", confidence: 1, source: "user" },
    ];
    const v = validateRows([{ Name: "Acme", Source: "Website" }], leadMapping);
    expect(v.entities).toEqual(["lead"]);
    const b = buildBundle(v.validRecords);
    expect(b.leads[0]).toMatchObject({ name: "Acme", source: "Website", status: "new" });
    expect(b.customers).toHaveLength(0);
  });
});

describe("own fields in imports", () => {
  const map = (column: string, target: string): ColumnMapping => ({ column, target, confidence: 1, source: "user" });
  const sheet = [{ שם: "דנה", סכום: "200", תאריך: "01/05/2025", רכב: "12-345-67", הערה: "VIP", חדש: "כן" }];
  const mapping = [
    map("שם", "customer.name"),
    map("סכום", "transaction.amount"),
    map("תאריך", "transaction.date"),
    map("רכב", "field:customers:f_car"),
    map("הערה", "custom"),
    map("חדש", "newfield:transactions"),
  ];

  it("puts mapped columns under the field key and keeps raw extra columns", () => {
    const v = validateRows(sheet, mapping);
    const r = v.validRecords[0];
    expect(r.customer?.custom_fields).toEqual({ הערה: "VIP", חדש: "כן", f_car: "12-345-67" });
    expect(r.transaction?.custom_fields).toBeUndefined();
  });

  it("fills a sale field", () => {
    const v = validateRows(sheet, [...mapping.slice(0, 5), map("חדש", "field:transactions:f_new")]);
    expect(v.validRecords[0].transaction?.custom_fields).toEqual({ f_new: "כן" });
    expect(detectEntities([map("רכב", "field:customers:f_car")])).toEqual([]);
  });
});
