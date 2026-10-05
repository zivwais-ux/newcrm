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

// Numbers and currency use en-US grouping ("₪1,250") on purpose: it's what Israeli
// businesses read, and it renders identically on server and browser (no ICU drift).
const numberFormatter = new Intl.NumberFormat("en-US");
export function formatNumber(value: number | null | undefined) {
  return numberFormatter.format(Number(value ?? 0));
}

/** "Oct 2026"-style label in Hebrew: "אוק׳ 2026" (short) or "אוקטובר 2026" (long). */
export function formatMonth(value: string | Date, long = false) {
  const d = parseDateValue(value);
  if (Number.isNaN(d.getTime())) return "—";
  return `${(long ? MONTHS_LONG : MONTHS)[d.getMonth()]} ${d.getFullYear()}`;
}

/** Hebrew plural helper: plural(3, "לקוח", "לקוחות") → "3 לקוחות", plural(1, …) → "לקוח אחד". */
export function plural(n: number, one: string, many: string, oneLabel?: string) {
  if (n === 1) return oneLabel ?? `${one} אחד`;
  return `${formatNumber(n)} ${many}`;
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

export const MONTHS = ["ינו׳", "פבר׳", "מרץ", "אפר׳", "מאי", "יוני", "יולי", "אוג׳", "ספט׳", "אוק׳", "נוב׳", "דצמ׳"];
export const MONTHS_LONG = ["ינואר", "פברואר", "מרץ", "אפריל", "מאי", "יוני", "יולי", "אוגוסט", "ספטמבר", "אוקטובר", "נובמבר", "דצמבר"];
const WEEKDAYS = ["א׳", "ב׳", "ג׳", "ד׳", "ה׳", "ו׳", "ש׳"];

/** Parses "yyyy-mm-dd" as a local calendar date (no timezone shift); other strings as instants. */
export function parseDateValue(value: string | Date): Date {
  if (value instanceof Date) return value;
  const m = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(value);
}

/** "4 באוק׳ 2026". Formatted by hand so server and browser render identical text. */
export function formatDate(value: string | Date | null | undefined) {
  if (!value) return "—";
  const d = parseDateValue(value);
  if (Number.isNaN(d.getTime())) return "—";
  return `${d.getDate()} ב${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

/** "יום א׳, 4 באוק׳ · 15:00" in the viewer's local time. Use from client components after mount. */
export function formatDateTime(value: string | Date) {
  const d = parseDateValue(value);
  if (Number.isNaN(d.getTime())) return "—";
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `יום ${WEEKDAYS[d.getDay()]}, ${d.getDate()} ב${MONTHS[d.getMonth()]} · ${hh}:${mm}`;
}

export function daysAgo(value: string | Date | null | undefined) {
  if (!value) return null;
  const d = parseDateValue(value);
  return Math.floor((Date.now() - d.getTime()) / 86_400_000);
}

export function relativeDays(value: string | Date | null | undefined) {
  const n = daysAgo(value);
  if (n === null) return "—";
  if (n <= 0) return "היום";
  if (n === 1) return "אתמול";
  if (n === 2) return "שלשום";
  return `לפני ${formatNumber(n)} ימים`;
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
