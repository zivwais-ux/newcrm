import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseCsvText, parseXlsxBuffer } from "./parse-file";
import { suggestMappings } from "./heuristics";
import { validateRows } from "./validate";
import { buildBundle } from "./transform";

describe("samples/customers_and_sales", () => {
  it("parses the xlsx and csv identically enough to import", async () => {
    const buf = readFileSync("samples/customers_and_sales.xlsx");
    const xlsx = await parseXlsxBuffer(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
    const csv = parseCsvText(readFileSync("samples/customers_and_sales.csv", "utf8"));
    expect(xlsx.headers).toEqual(["Customer Name", "Phone", "Email", "Purchase Date", "Amount", "Service", "Sales Rep"]);
    expect(xlsx.rows.length).toBe(csv.rows.length);

    for (const file of [xlsx, csv]) {
      const mapping = suggestMappings(file.headers, file.rows.slice(0, 200));
      expect(Object.fromEntries(mapping.map((m) => [m.column, m.target]))).toMatchObject({
        "Customer Name": "customer.name",
        Phone: "customer.phone",
        Email: "customer.email",
        "Purchase Date": "transaction.date",
        Amount: "transaction.amount",
        Service: "transaction.product_or_service",
        "Sales Rep": "transaction.owner",
      });
      const v = validateRows(file.rows, mapping);
      expect(v.issueCounts.missing_customer_name).toBe(8);
      expect(v.issueCounts.invalid_amount).toBe(1);
      expect(v.duplicates).toBeGreaterThanOrEqual(15);
      expect(v.valid + v.rowIssues.length).toBe(v.total);
      const b = buildBundle(v.validRecords);
      expect(b.customers.length).toBeGreaterThan(400);
      expect(b.services.length).toBe(12);
    }
  });
});
