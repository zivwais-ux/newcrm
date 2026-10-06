import { isoDate, MONTHS_LONG } from "@/lib/utils";

export const BUSINESS_TZ = "Asia/Jerusalem";

function israelParts(now: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: BUSINESS_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
    timeZoneName: "longOffset",
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return {
    y: Number(get("year")),
    m: Number(get("month")),
    d: Number(get("day")),
    h: Number(get("hour")),
    mi: Number(get("minute")),
    s: Number(get("second")),
    offset: get("timeZoneName").replace("GMT", "") || "+00:00",
  };
}

/**
 * The current Israel wall-clock time as a Date whose *local* getters (getDate, getMonth…)
 * return Israel values — on a UTC server and in an Israeli browser alike.
 * Use it for calendar math (ranges, "this month"); never for storing instants.
 */
export function israelNow(now = new Date()) {
  const p = israelParts(now);
  return new Date(p.y, p.m - 1, p.d, p.h, p.mi, p.s);
}

/** Today's date in Israel, "yyyy-mm-dd". */
export function israelToday(now = new Date()) {
  return isoDate(israelNow(now));
}

/** Start/end instants (ISO) of today's calendar day in Israel. */
export function israelDay(now = new Date()) {
  const p = israelParts(now);
  const ymd = `${p.y}-${String(p.m).padStart(2, "0")}-${String(p.d).padStart(2, "0")}`;
  const start = new Date(`${ymd}T00:00:00${p.offset}`);
  return { ymd, start: start.toISOString(), end: new Date(start.getTime() + 86_400_000).toISOString() };
}

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

export function resolveRange(preset: RangePreset, now = israelNow(), earliest?: string | null) {
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
export function lastTwoFullMonths(now = israelNow()) {
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
export function monthToDate(now = israelNow()) {
  const curStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const prevStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const prevEnd = new Date(now.getFullYear(), now.getMonth() - 1, Math.min(now.getDate(), new Date(now.getFullYear(), now.getMonth(), 0).getDate()));
  return {
    current: { from: isoDate(curStart), to: isoDate(now) },
    previous: { from: isoDate(prevStart), to: isoDate(prevEnd) },
  };
}
