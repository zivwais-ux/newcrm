/**
 * Generates samples/customers_and_sales.xlsx (+ .csv): a realistic export from a
 * service business with the messiness of real files — human headers, a few
 * duplicate rows, missing names and a bad amount — to exercise the importer.
 */
import ExcelJS from "exceljs";
import { writeFileSync, mkdirSync } from "node:fs";
import { generateServiceDataset } from "../lib/demo/generator";

async function main() {
  const ds = generateServiceDataset(new Date(), 21);
  const customers = new Map(ds.customers.map((c) => [c.id, c]));
  const rows = ds.transactions
    .filter((t) => t.type !== "refund")
    .map((t) => {
      const c = customers.get(t.customer_id)!;
      return {
        "Customer Name": c.company ? `${c.name} (${c.company})` : c.name,
        Phone: c.phone ?? "",
        Email: c.email ?? "",
        "Purchase Date": new Date(`${t.date}T00:00:00Z`),
        Amount: t.amount,
        Service: t.product_or_service,
        "Sales Rep": t.owner_name,
      };
    });

  // Real-world mess: duplicates, missing names, a malformed amount.
  for (let i = 0; i < 18; i++) rows.splice(40 + i * 97, 0, { ...rows[40 + i * 90] });
  for (let i = 0; i < 8; i++) rows[120 + i * 211]["Customer Name"] = "";
  (rows[777] as Record<string, unknown>).Amount = "TBD";

  mkdirSync("samples", { recursive: true });
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Sales");
  ws.columns = Object.keys(rows[0]).map((key) => ({ header: key, key, width: key === "Customer Name" ? 30 : 16 }));
  ws.addRows(rows);
  ws.getColumn("Purchase Date").numFmt = "dd/mm/yyyy";
  ws.getColumn("Amount").numFmt = "#,##0";
  ws.getRow(1).font = { bold: true };
  await wb.xlsx.writeFile("samples/customers_and_sales.xlsx");

  const esc = (v: unknown) => {
    const s = v instanceof Date ? `${String(v.getUTCDate()).padStart(2, "0")}/${String(v.getUTCMonth() + 1).padStart(2, "0")}/${v.getUTCFullYear()}` : String(v ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const headers = Object.keys(rows[0]);
  const csv = [headers.join(","), ...rows.map((r) => headers.map((h) => esc((r as Record<string, unknown>)[h])).join(","))].join("\n");
  writeFileSync("samples/customers_and_sales.csv", csv);
  console.log(`Wrote ${rows.length} rows to samples/customers_and_sales.xlsx and .csv`);
}

main();
