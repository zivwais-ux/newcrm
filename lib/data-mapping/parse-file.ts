// Parses uploaded CSV / XLSX files into header + row objects. Runs in the browser
// (and in tests). XLSX support is loaded lazily to keep the main bundle small.

import Papa from "papaparse";
import type { RawRow } from "./heuristics";

export const MAX_FILE_BYTES = 10 * 1024 * 1024;
export const MAX_ROWS = 50_000;

export interface ParsedFile {
  headers: string[];
  rows: RawRow[];
  fileType: "csv" | "excel";
  sheetName?: string;
}

export class FileParseError extends Error {}

export function detectFileType(name: string): "csv" | "excel" | null {
  const n = name.toLowerCase();
  if (n.endsWith(".csv") || n.endsWith(".txt")) return "csv";
  if (n.endsWith(".xlsx")) return "excel";
  return null;
}

function uniqueHeaders(raw: unknown[]): string[] {
  const seen = new Map<string, number>();
  return raw.map((h, i) => {
    let name = String(h ?? "").trim() || `Column ${i + 1}`;
    const n = seen.get(name) ?? 0;
    seen.set(name, n + 1);
    if (n) name = `${name} (${n + 1})`;
    return name;
  });
}

export function parseCsvText(text: string): ParsedFile {
  const result = Papa.parse<string[]>(text.replace(/^﻿/, ""), { skipEmptyLines: "greedy" });
  const data = result.data.filter((r) => r.some((c) => String(c).trim() !== ""));
  if (data.length < 2) throw new FileParseError("This file doesn't have a header row and at least one row of data.");
  const headers = uniqueHeaders(data[0]);
  const rows = data.slice(1, MAX_ROWS + 1).map((r) => Object.fromEntries(headers.map((h, i) => [h, r[i] ?? ""])));
  return { headers, rows, fileType: "csv" };
}

type CellValue = unknown;

function cellToValue(v: CellValue): unknown {
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

export async function parseXlsxBuffer(buffer: ArrayBuffer): Promise<ParsedFile> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(buffer);
  } catch {
    throw new FileParseError("We couldn't open this Excel file. Make sure it's a valid .xlsx file (not password-protected).");
  }
  const sheet = wb.worksheets.find((ws) => ws.actualRowCount > 1) ?? wb.worksheets[0];
  if (!sheet) throw new FileParseError("This workbook has no sheets.");

  const matrix: unknown[][] = [];
  sheet.eachRow({ includeEmpty: false }, (row) => {
    const values = (row.values as CellValue[]).slice(1).map(cellToValue);
    if (values.some((v) => String(v ?? "").trim() !== "")) matrix.push(values);
  });
  const headerIndex = matrix.findIndex((r) => r.filter((v) => String(v ?? "").trim() !== "").length >= 2);
  if (headerIndex < 0 || matrix.length - headerIndex < 2)
    throw new FileParseError("This sheet doesn't have a header row and at least one row of data.");
  const headers = uniqueHeaders(matrix[headerIndex]);
  const rows = matrix
    .slice(headerIndex + 1, headerIndex + 1 + MAX_ROWS)
    .map((r) => Object.fromEntries(headers.map((h, i) => [h, r[i] ?? ""])));
  return { headers, rows, fileType: "excel", sheetName: sheet.name };
}

export async function parseFile(file: File): Promise<ParsedFile> {
  const type = detectFileType(file.name);
  if (!type) throw new FileParseError("Please upload a .csv or .xlsx file.");
  if (file.size > MAX_FILE_BYTES) throw new FileParseError("This file is larger than 10 MB. Try splitting it into smaller files.");
  if (file.size === 0) throw new FileParseError("This file is empty.");
  if (type === "csv") return parseCsvText(await file.text());
  return parseXlsxBuffer(await file.arrayBuffer());
}
