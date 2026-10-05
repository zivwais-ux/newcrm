import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import ExcelJS from "exceljs";
import { decodeText, matrixToTable, parseCsvText, parsePastedText, parseVcardText, parseWorkbook } from "./parse-file";
import { suggestMappings } from "./heuristics";
import { parseDate, parseMoney } from "./values";

function fileFrom(bytes: Uint8Array | ArrayBuffer, name: string) {
  return new File([bytes as BlobPart], name);
}

/** Encodes Hebrew text as Windows-1255 (what older Israeli Excel saves as CSV). */
function win1255(text: string) {
  return Uint8Array.from([...text].map((ch) => {
    const c = ch.charCodeAt(0);
    if (c >= 0x05d0 && c <= 0x05ea) return 0xe0 + (c - 0x05d0);
    return c;
  }));
}

describe("text files", () => {
  it("reads Windows-1255 Hebrew CSV with semicolons", async () => {
    const csv = "שם;טלפון;סכום\nדנה כהן;050-1234567;450\nיוסי לוי;052-7654321;1,200\n";
    const wb = await parseWorkbook(fileFrom(win1255(csv), "export.csv"));
    expect(wb.sheets[0].headers).toEqual(["שם", "טלפון", "סכום"]);
    expect(wb.sheets[0].rows[0]["שם"]).toBe("דנה כהן");
    expect(wb.sheets[0].rows).toHaveLength(2);
  });

  it("reads UTF-16 tab-separated 'Unicode text' from Excel", () => {
    const text = "﻿שם\tסכום\nדנה\t100\n";
    const bytes = new Uint8Array(text.length * 2);
    [...text].forEach((ch, i) => {
      bytes[i * 2] = ch.charCodeAt(0) & 0xff;
      bytes[i * 2 + 1] = ch.charCodeAt(0) >> 8;
    });
    const t = parseCsvText(decodeText(bytes));
    expect(t.headers).toEqual(["שם", "סכום"]);
  });

  it("parses a table pasted from a spreadsheet", () => {
    const wb = parsePastedText("שם\tתאריך\tסכום\nדנה\t12/03/2026\t₪450\n");
    expect(wb.kind).toBe("paste");
    expect(wb.sheets[0].rows[0]["סכום"]).toBe("₪450");
  });
});

describe("table cleanup", () => {
  it("skips title rows above the header and total rows below", () => {
    const t = matrixToTable(
      [
        ["דוח מכירות 2026"],
        [],
        ["שם לקוח", "תאריך", "סכום"],
        ["דנה", "01/02/2026", 100],
        ["יוסי", "03/02/2026", 200],
        ['סה"כ', "", 300],
      ],
      "excel",
    )!;
    expect(t.headers).toEqual(["שם לקוח", "תאריך", "סכום"]);
    expect(t.rows).toHaveLength(2);
  });
});

describe("spreadsheets", () => {
  it("reads every sheet of an .xlsx workbook", async () => {
    const wb = new ExcelJS.Workbook();
    wb.addWorksheet("לקוחות").addRows([["שם", "טלפון"], ["דנה", "050-1234567"]]);
    wb.addWorksheet("מכירות").addRows([["שם", "תאריך", "סכום"], ["דנה", "01/02/2026", 450]]);
    wb.addWorksheet("ריק");
    const buf = await wb.xlsx.writeBuffer();
    const parsed = await parseWorkbook(fileFrom(buf as ArrayBuffer, "book.xlsx"));
    expect(parsed.sheets.map((s) => s.sheetName)).toEqual(["לקוחות", "מכירות"]);
  });

  it.each(["xls", "ods"] as const)("reads legacy .%s files", async (bookType) => {
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([["שם", "סכום"], ["דנה", 450], ["יוסי", 120]]), "גיליון1");
    const out = XLSX.write(book, { type: "array", bookType }) as ArrayBuffer;
    const parsed = await parseWorkbook(fileFrom(out, `old.${bookType}`));
    expect(parsed.sheets[0].headers).toEqual(["שם", "סכום"]);
    expect(parsed.sheets[0].rows).toHaveLength(2);
  });

  it("rejects unsupported files with a Hebrew message", async () => {
    await expect(parseWorkbook(fileFrom(new Uint8Array([1, 2]), "photo.jpg"))).rejects.toThrow(/לא נתמך/);
  });
});

describe("vCard contacts", () => {
  it("turns phone contacts into customer rows", () => {
    const t = parseVcardText(
      [
        "BEGIN:VCARD",
        "VERSION:3.0",
        "FN:דנה כהן",
        "TEL;TYPE=CELL:+972-50-1234567",
        "EMAIL:dana@example.com",
        "END:VCARD",
        "BEGIN:VCARD",
        "VERSION:2.1",
        "N;CHARSET=UTF-8;ENCODING=QUOTED-PRINTABLE:=D7=9C=D7=95=D7=99;=D7=99=D7=95=D7=A1=D7=99",
        "TEL:052-7654321",
        "END:VCARD",
      ].join("\r\n"),
    );
    expect(t.rows).toHaveLength(2);
    expect(t.rows[0]["שם"]).toBe("דנה כהן");
    expect(t.rows[1]["שם"]).toBe("יוסי לוי");
    const mapping = suggestMappings(t.headers, t.rows);
    expect(mapping.find((m) => m.column === "שם")?.target).toBe("customer.name");
    expect(mapping.find((m) => m.column === "טלפון")?.target).toBe("customer.phone");
  });
});

describe("Hebrew values and headers", () => {
  it("parses shekel amounts and Hebrew dates", () => {
    expect(parseMoney('1,250 ש"ח')).toBe(1250);
    expect(parseMoney("1,250 ש״ח")).toBe(1250);
    expect(parseMoney("300 שקלים")).toBe(300);
    expect(parseDate("12 במרץ 2026")).toBe("2026-03-12");
    expect(parseDate("05/04/2026")).toBe("2026-04-05");
  });

  it("maps common Israeli column names", () => {
    const headers = ["שם המטופל", "מספר טלפון", "תאריך טיפול", "סכום ששולם", "סוג טיפול"];
    const rows = [{ "שם המטופל": "דנה", "מספר טלפון": "050-1234567", "תאריך טיפול": "01/02/2026", "סכום ששולם": "450", "סוג טיפול": "פנים" }];
    const targets = Object.fromEntries(suggestMappings(headers, rows).map((m) => [m.column, m.target]));
    expect(targets).toMatchObject({
      "שם המטופל": "customer.name",
      "מספר טלפון": "customer.phone",
      "תאריך טיפול": "transaction.date",
      "סכום ששולם": "transaction.amount",
      "סוג טיפול": "transaction.product_or_service",
    });
  });
});
