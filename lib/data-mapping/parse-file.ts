// Turns whatever a small business has — Excel (any version), LibreOffice, Numbers, CSV/TSV/TXT
// in any encoding, phone contacts (vCard) or a table pasted from a spreadsheet — into
// header + row tables. Runs in the browser (and in tests). Heavy parsers load lazily.

import Papa from "papaparse";
import type { RawRow } from "./heuristics";

export const MAX_FILE_BYTES = 10 * 1024 * 1024;
export const MAX_ROWS = 50_000;

export type SourceKind = "csv" | "excel" | "vcard" | "paste" | "gsheet";

export interface ParsedFile {
  headers: string[];
  rows: RawRow[];
  fileType: "csv" | "excel";
  sheetName?: string;
}

export interface ParsedWorkbook {
  kind: SourceKind;
  /** Every sheet that holds a table, in workbook order. */
  sheets: ParsedFile[];
}

export class FileParseError extends Error {}

export const ACCEPTED_EXTENSIONS = [".xlsx", ".xlsm", ".xls", ".ods", ".numbers", ".csv", ".tsv", ".txt", ".vcf"];
export const ACCEPT_ATTR = [
  ...ACCEPTED_EXTENSIONS,
  "text/csv",
  "text/plain",
  "text/vcard",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.oasis.opendocument.spreadsheet",
].join(",");

type FileFormat = "text" | "xlsx" | "legacy" | "vcard";

export function detectFormat(name: string): FileFormat | null {
  const n = name.toLowerCase();
  if (/\.(csv|tsv|txt)$/.test(n)) return "text";
  if (/\.(xlsx|xlsm)$/.test(n)) return "xlsx";
  if (/\.(xls|ods|numbers)$/.test(n)) return "legacy";
  if (/\.(vcf|vcard)$/.test(n)) return "vcard";
  return null;
}

/** Kept for callers that only need csv vs excel. */
export function detectFileType(name: string): "csv" | "excel" | null {
  const f = detectFormat(name);
  if (!f) return null;
  return f === "text" || f === "vcard" ? "csv" : "excel";
}

// ---------------------------------------------------------------------------
// Shared table cleanup

const str = (v: unknown) => (v instanceof Date ? "x" : String(v ?? "").trim());
const TOTAL_RE = /^(סה["״׳']?כ|סך הכל|סיכום|total|totals|grand total|sum)(?=$|[\s:\-])/i;

function uniqueHeaders(raw: unknown[]): string[] {
  const seen = new Map<string, number>();
  return raw.map((h, i) => {
    let name = str(h) || `עמודה ${i + 1}`;
    const n = seen.get(name) ?? 0;
    seen.set(name, n + 1);
    if (n) name = `${name} (${n + 1})`;
    return name;
  });
}

/** True when a row looks like a header: several filled cells, mostly text, few numbers/dates. */
function looksLikeHeader(row: unknown[]) {
  const filled = row.filter((v) => str(v) !== "");
  if (filled.length < 2) return false;
  const texty = filled.filter((v) => typeof v === "string" && !/^[\d\s.,₪$%/\-:]+$/.test(v.trim()));
  return texty.length / filled.length >= 0.6;
}

/**
 * Matrix → table. Skips titles/logos above the table, picks the header row, drops
 * fully empty columns and "Total" rows, and caps the row count.
 */
export function matrixToTable(matrix: unknown[][], fileType: "csv" | "excel", sheetName?: string): ParsedFile | null {
  const rows = matrix.filter((r) => r.some((v) => str(v) !== ""));
  if (rows.length < 2) return null;
  const probe = rows.slice(0, 15);
  let headerIndex = probe.findIndex(looksLikeHeader);
  if (headerIndex < 0) headerIndex = rows.findIndex((r) => r.filter((v) => str(v) !== "").length >= 2);
  if (headerIndex < 0 || rows.length - headerIndex < 2) return null;

  const width = Math.max(...rows.slice(headerIndex).map((r) => r.length));
  const headerRow = Array.from({ length: width }, (_, i) => rows[headerIndex][i]);
  const body = rows.slice(headerIndex + 1).filter((r) => !TOTAL_RE.test(str(r.find((v) => str(v) !== ""))));
  // Keep a column if it has a header or any value.
  const keep = headerRow.map((h, i) => str(h) !== "" || body.some((r) => str(r[i]) !== "")).map((k, i) => (k ? i : -1)).filter((i) => i >= 0);
  if (keep.length < 1 || body.length < 1) return null;

  const headers = uniqueHeaders(keep.map((i) => headerRow[i]));
  const out = body.slice(0, MAX_ROWS).map((r) => Object.fromEntries(headers.map((h, j) => [h, r[keep[j]] ?? ""])));
  return { headers, rows: out, fileType, sheetName };
}

// ---------------------------------------------------------------------------
// Text (CSV / TSV / TXT / pasted tables)

/** Decodes bytes as UTF-8, UTF-16 (Excel "Unicode text") or Windows-1255 (older Hebrew Excel). */
export function decodeText(bytes: Uint8Array): string {
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder("utf-16le").decode(bytes.subarray(2));
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder("utf-16be").decode(bytes.subarray(2));
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes).replace(/^﻿/, "");
  } catch {
    return new TextDecoder("windows-1255").decode(bytes);
  }
}

export function parseCsvText(text: string): ParsedFile {
  const result = Papa.parse<string[]>(text.replace(/^﻿/, ""), { skipEmptyLines: "greedy", delimitersToGuess: [",", "\t", ";", "|"] });
  const table = matrixToTable(result.data, "csv");
  if (!table) throw new FileParseError("לא מצאנו בקובץ שורת כותרות ולפחות שורה אחת של נתונים.");
  return table;
}

/** A table copied from Excel / Google Sheets and pasted as text (tab-separated). */
export function parsePastedText(text: string): ParsedWorkbook {
  if (!text.trim()) throw new FileParseError("לא הודבק כלום. העתק טבלה מאקסל והדבק כאן.");
  return { kind: "paste", sheets: [parseCsvText(text)] };
}

// ---------------------------------------------------------------------------
// Excel .xlsx via ExcelJS (all sheets)

function cellToValue(v: unknown): unknown {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) return v;
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    if ("result" in o) return cellToValue(o.result);
    if ("richText" in o && Array.isArray(o.richText)) return (o.richText as { text: string }[]).map((t) => t.text).join("");
    if ("text" in o) return String(o.text);
    if ("error" in o) return "";
  }
  return v;
}

async function xlsxSheets(buffer: ArrayBuffer): Promise<ParsedFile[]> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  const sheets: ParsedFile[] = [];
  for (const ws of wb.worksheets) {
    if (ws.state && ws.state !== "visible") continue;
    const matrix: unknown[][] = [];
    ws.eachRow({ includeEmpty: false }, (row) => {
      matrix.push((row.values as unknown[]).slice(1).map(cellToValue));
    });
    const table = matrixToTable(matrix, "excel", ws.name);
    if (table) sheets.push(table);
  }
  return sheets;
}

/** First sheet with a table — kept for tests and simple callers. */
export async function parseXlsxBuffer(buffer: ArrayBuffer): Promise<ParsedFile> {
  let sheets: ParsedFile[];
  try {
    sheets = await xlsxSheets(buffer);
  } catch {
    throw new FileParseError("לא הצלחנו לפתוח את קובץ האקסל. ודא שהוא לא מוגן בסיסמה.");
  }
  if (!sheets.length) throw new FileParseError("לא מצאנו בקובץ טבלה עם שורת כותרות ונתונים.");
  return sheets[0];
}

// ---------------------------------------------------------------------------
// Legacy .xls / .ods / .numbers (and .xlsx fallback) via SheetJS

async function sheetjsSheets(buffer: ArrayBuffer): Promise<ParsedFile[]> {
  const XLSX = await import("xlsx");
  const wb = XLSX.read(new Uint8Array(buffer), { type: "array", cellDates: true, dense: true });
  const sheets: ParsedFile[] = [];
  for (const name of wb.SheetNames) {
    const ws = wb.Sheets[name];
    if (!ws) continue;
    const matrix = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: true, defval: "", blankrows: false });
    const table = matrixToTable(matrix, "excel", name);
    if (table) sheets.push(table);
  }
  return sheets;
}

// ---------------------------------------------------------------------------
// vCard (contacts exported from a phone / Google Contacts / Outlook)

function unfoldVcard(text: string) {
  return text.replace(/\r\n/g, "\n").replace(/\n[ \t]/g, "");
}

function decodeQuotedPrintable(value: string) {
  const bytes: number[] = [];
  const s = value.replace(/=\n/g, "");
  for (let i = 0; i < s.length; i++) {
    if (s[i] === "=" && /^[0-9A-F]{2}$/i.test(s.slice(i + 1, i + 3))) {
      bytes.push(parseInt(s.slice(i + 1, i + 3), 16));
      i += 2;
    } else bytes.push(s.charCodeAt(i));
  }
  return new TextDecoder("utf-8").decode(new Uint8Array(bytes));
}

export function parseVcardText(text: string): ParsedFile {
  const cards = unfoldVcard(text).split(/BEGIN:VCARD/i).slice(1);
  const rows: RawRow[] = [];
  for (const card of cards) {
    const props: Record<string, string[]> = {};
    for (const line of card.split("\n")) {
      const idx = line.indexOf(":");
      if (idx < 0) continue;
      const meta = line.slice(0, idx);
      const [rawKey, ...params] = meta.split(";");
      const key = rawKey.replace(/^item\d+\./i, "").toUpperCase();
      let value = line.slice(idx + 1).trim();
      if (params.some((p) => /ENCODING=QUOTED-PRINTABLE/i.test(p))) value = decodeQuotedPrintable(value);
      value = value.replace(/\\,/g, ",").replace(/\\;/g, ";").replace(/\\n/gi, " ");
      (props[key] ??= []).push(value);
    }
    const fn = props.FN?.[0] || (props.N?.[0] ?? "").split(";").slice(0, 2).reverse().filter(Boolean).join(" ");
    const name = fn.trim();
    const phone = props.TEL?.[0] ?? "";
    const email = props.EMAIL?.[0] ?? "";
    if (!name && !phone && !email) continue;
    rows.push({
      "שם": name || phone || email,
      "טלפון": phone,
      "אימייל": email,
      "חברה": (props.ORG?.[0] ?? "").split(";")[0],
      "הערות": props.NOTE?.[0] ?? "",
    });
  }
  if (!rows.length) throw new FileParseError("לא מצאנו אנשי קשר בקובץ הזה.");
  const headers = ["שם", "טלפון", "אימייל", "חברה", "הערות"].filter((h) => rows.some((r) => String(r[h] ?? "") !== ""));
  return { headers, rows: rows.slice(0, MAX_ROWS).map((r) => Object.fromEntries(headers.map((h) => [h, r[h]]))), fileType: "csv", sheetName: "אנשי קשר" };
}

// ---------------------------------------------------------------------------

/** Parses raw bytes of a workbook (used for Google Sheets exports fetched by the server). */
export async function parseWorkbookBuffer(buffer: ArrayBuffer, kind: SourceKind = "excel"): Promise<ParsedWorkbook> {
  let sheets: ParsedFile[] = [];
  try {
    sheets = await xlsxSheets(buffer);
  } catch {
    sheets = await sheetjsSheets(buffer).catch(() => []);
  }
  if (!sheets.length) throw new FileParseError("לא מצאנו בקובץ טבלה עם שורת כותרות ונתונים.");
  return { kind, sheets };
}

export async function parseWorkbook(file: File): Promise<ParsedWorkbook> {
  const format = detectFormat(file.name);
  if (!format) throw new FileParseError("סוג הקובץ לא נתמך. אפשר להעלות אקסל (xlsx, xls), ‏CSV, ‏ODS, ‏Numbers או אנשי קשר (vcf).");
  if (file.size > MAX_FILE_BYTES) throw new FileParseError("הקובץ גדול מ־10MB. נסה לפצל אותו לכמה קבצים קטנים יותר.");
  if (file.size === 0) throw new FileParseError("הקובץ ריק.");
  const buffer = await file.arrayBuffer();

  if (format === "text") return { kind: "csv", sheets: [parseCsvText(decodeText(new Uint8Array(buffer)))] };
  if (format === "vcard") return { kind: "vcard", sheets: [parseVcardText(decodeText(new Uint8Array(buffer)))] };
  if (format === "legacy") {
    let sheets: ParsedFile[];
    try {
      sheets = await sheetjsSheets(buffer);
    } catch {
      throw new FileParseError("לא הצלחנו לפתוח את הקובץ. ודא שהוא לא מוגן בסיסמה, או שמור אותו מחדש כ־xlsx.");
    }
    if (!sheets.length) throw new FileParseError("לא מצאנו בקובץ טבלה עם שורת כותרות ונתונים.");
    return { kind: "excel", sheets };
  }
  try {
    return await parseWorkbookBuffer(buffer, "excel");
  } catch (e) {
    if (e instanceof FileParseError) throw e;
    throw new FileParseError("לא הצלחנו לפתוח את קובץ האקסל. ודא שהוא לא מוגן בסיסמה.");
  }
}

/** Single-table convenience wrapper. */
export async function parseFile(file: File): Promise<ParsedFile> {
  return (await parseWorkbook(file)).sheets[0];
}
