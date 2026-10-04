import { isoDate } from "@/lib/utils";

export const RANGE_PRESETS = {
  "30d": "Last 30 days",
  "90d": "Last 90 days",
  "6m": "Last 6 months",
  "12m": "Last 12 months",
  ytd: "Year to date",
  all: "All time",
} as const;
export type RangePreset = keyof typeof RANGE_PRESETS;

export const COMPARE_OPTIONS = {
  previous_period: "Previous period",
  previous_month: "Previous month",
  previous_quarter: "Previous quarter",
  previous_year: "Previous year",
} as const;
export type CompareOption = keyof typeof COMPARE_OPTIONS;

export function resolveRange(preset: RangePreset, now = new Date(), earliest?: string | null) {
  const to = isoDate(now);
  const d = new Date(now);
  switch (preset) {
    case "30d":
      d.setDate(d.getDate() - 29);
      break;
    case "90d":
      d.setDate(d.getDate() - 89);
      break;
    case "6m":
      d.setMonth(d.getMonth() - 5, 1);
      break;
    case "12m":
      d.setMonth(d.getMonth() - 11, 1);
      break;
    case "ytd":
      d.setMonth(0, 1);
      break;
    case "all":
      return { from: earliest ?? "2000-01-01", to };
  }
  return { from: isoDate(d), to };
}

/** Last full calendar month vs. the month before it. */
export function lastTwoFullMonths(now = new Date()) {
  const curStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const curEnd = new Date(now.getFullYear(), now.getMonth(), 0);
  const prevStart = new Date(now.getFullYear(), now.getMonth() - 2, 1);
  const prevEnd = new Date(now.getFullYear(), now.getMonth() - 1, 0);
  return {
    current: { from: isoDate(curStart), to: isoDate(curEnd), label: curStart.toLocaleString("en", { month: "long" }) },
    previous: { from: isoDate(prevStart), to: isoDate(prevEnd), label: prevStart.toLocaleString("en", { month: "long" }) },
  };
}

/** Month-to-date vs. the same days of last month — fair comparison mid-month. */
export function monthToDate(now = new Date()) {
  const curStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const prevStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const prevEnd = new Date(now.getFullYear(), now.getMonth() - 1, Math.min(now.getDate(), new Date(now.getFullYear(), now.getMonth(), 0).getDate()));
  return {
    current: { from: isoDate(curStart), to: isoDate(now) },
    previous: { from: isoDate(prevStart), to: isoDate(prevEnd) },
  };
}
