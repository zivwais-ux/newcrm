import { isoDate, MONTHS_LONG } from "@/lib/utils";

export const RANGE_PRESETS = {
  "30d": "30 הימים האחרונים",
  "90d": "90 הימים האחרונים",
  "6m": "חצי שנה אחרונה",
  "12m": "12 החודשים האחרונים",
  ytd: "מתחילת השנה",
  all: "כל הזמן",
} as const;
export type RangePreset = keyof typeof RANGE_PRESETS;

export const COMPARE_OPTIONS = {
  previous_period: "התקופה הקודמת",
  previous_month: "החודש הקודם",
  previous_quarter: "הרבעון הקודם",
  previous_year: "השנה הקודמת",
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
    current: { from: isoDate(curStart), to: isoDate(curEnd), label: MONTHS_LONG[curStart.getMonth()] },
    previous: { from: isoDate(prevStart), to: isoDate(prevEnd), label: MONTHS_LONG[prevStart.getMonth()] },
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
