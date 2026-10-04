import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const currencyFormatters = new Map<string, Intl.NumberFormat>();

export function formatCurrency(value: number | null | undefined, currency = "ILS", compact = false) {
  const key = `${currency}-${compact}`;
  let f = currencyFormatters.get(key);
  if (!f) {
    f = new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: compact ? 1 : 0,
      notation: compact ? "compact" : "standard",
    });
    currencyFormatters.set(key, f);
  }
  return f.format(Number(value ?? 0));
}

export function formatNumber(value: number | null | undefined) {
  return new Intl.NumberFormat("en-US").format(Number(value ?? 0));
}

export function formatPercent(value: number | null | undefined, digits = 0) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(digits)}%`;
}

export function pctChange(current: number, previous: number): number | null {
  if (!previous) return current ? null : 0;
  return ((current - previous) / Math.abs(previous)) * 100;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Parses "yyyy-mm-dd" as a local calendar date (no timezone shift); other strings as instants. */
export function parseDateValue(value: string | Date): Date {
  if (value instanceof Date) return value;
  const m = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(value);
}

/** "4 Oct 2026". Formatted by hand so server and browser render identical text. */
export function formatDate(value: string | Date | null | undefined) {
  if (!value) return "—";
  const d = parseDateValue(value);
  if (Number.isNaN(d.getTime())) return "—";
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

/** "Sun 4 Oct, 15:00" in the viewer's local time. Use from client components after mount. */
export function formatDateTime(value: string | Date) {
  const d = parseDateValue(value);
  if (Number.isNaN(d.getTime())) return "—";
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${WEEKDAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}, ${hh}:${mm}`;
}

export function daysAgo(value: string | Date | null | undefined) {
  if (!value) return null;
  const d = parseDateValue(value);
  return Math.floor((Date.now() - d.getTime()) / 86_400_000);
}

export function relativeDays(value: string | Date | null | undefined) {
  const n = daysAgo(value);
  if (n === null) return "—";
  if (n <= 0) return "today";
  if (n === 1) return "yesterday";
  return `${n} days ago`;
}

export function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
}

/** ISO date (yyyy-mm-dd) in local time. */
export function isoDate(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
