import { israelNow } from "@/lib/analytics/dates";
import { isoDate } from "@/lib/utils";

// The command bar understands short Hebrew sentences and turns them into actions.
// Deterministic on purpose: it works without an AI key and never guesses silently —
// anything it doesn't recognise falls through to search.

export type Command =
  | { kind: "sale"; amount: number | null; name: string | null; service: string | null }
  | { kind: "appointment"; name: string | null; date: string | null; time: string | null; service: string | null }
  | { kind: "customer"; name: string | null; phone: string | null }
  | { kind: "task"; title: string; date: string | null }
  | { kind: "open"; href: string; label: string }
  | { kind: "add-module"; id: string; name: string }
  | { kind: "ask"; question: string }
  | { kind: "search"; query: string };

export interface ModuleRef {
  id: string;
  name: string;
}

export const PAGES: { words: string[]; href: string; label: string }[] = [
  { words: ["בית", "מסך העבודה", "שולחן"], href: "/home", label: "בית" },
  { words: ["לקוחות", "לקוח"], href: "/customers", label: "לקוחות" },
  { words: ["עסקאות", "עסקה"], href: "/deals", label: "עסקאות" },
  { words: ["משימות"], href: "/tasks", label: "משימות" },
  { words: ["מכירות", "כסף", "הכנסות", "תשלומים"], href: "/transactions", label: "כסף ומכירות" },
  { words: ["פניות", "לידים"], href: "/leads", label: "פניות" },
  { words: ["פעילות", "יומן", "תורים"], href: "/activities", label: "יומן פעילות" },
  { words: ["יועץ", "היועץ", "היועץ החכם", "ai"], href: "/ai", label: "היועץ החכם" },
  { words: ["נתונים", "הנתונים שלי", "קבצים", "ייבוא"], href: "/data", label: "הנתונים שלי" },
  { words: ["הגדרות"], href: "/settings", label: "הגדרות" },
  { words: ["מודולים", "ספריית הכלים", "כלים"], href: "/components", label: "ספריית המודולים" },
];

const WEEKDAYS = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];

// Hebrew has no \b for its letters: a word ends at whitespace, punctuation or the end.
const END = "(?=$|[\\s,.?!:;])";
const START = "(?:^|\\s)";

const SALE = new RegExp(`^(?:מכירה|מכרתי|רשום מכירה|תשלום|שילם|שילמה|קנה|קנתה)${END}`);
const BASE_APPOINTMENT_WORDS = ["תור", "פגישה"];
const BASE_CUSTOMER_WORDS = ["לקוח", "לקוחה"];

const escape = (w: string) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const alternation = (list: string[]) =>
  [...new Set(list.map((w) => clean(w)).filter(Boolean))]
    .sort((a, b) => b.length - a.length)
    .map(escape)
    .join("|");

/** "תור", "קבע תור"… plus the business's own appointment words ("טיפול", "סשן"). */
function appointmentRe(extra: string[]) {
  const words = alternation([...BASE_APPOINTMENT_WORDS, ...extra]);
  return new RegExp(`^(?:(?:קבע|קבעי)\\s+)?(?:${words})${END}`);
}

/** "לקוח חדש", "הוסף לקוח"… plus the business's own word ("מטופל חדש"). */
function customerRe(extra: string[]) {
  const words = alternation([...BASE_CUSTOMER_WORDS, ...extra]);
  return new RegExp(`^(?:(?:הוסף|הוסיפי)\\s+)?(?:${words})(?:\\s+(?:חדש|חדשה))?${END}`);
}
const TASK = new RegExp(`^(?:משימה|תזכורת|תזכיר לי|להזכיר לי|צריך)${END}`);
const OPEN = new RegExp(`^(?:פתח|פתחי|עבור ל|עבור|לך ל|הצג|תראה לי)${END}`);
const ADD_MODULE = new RegExp(`^(?:הוסף מודול|הוסיפי מודול|הוסף כלי|הוסף למסך|הוסף)${END}`);
const QUESTION = new RegExp(`^(?:מה|כמה|למה|מי|איך|מתי|האם|איזה|איזו|מאיפה)${END}`);

const PHONE = /(?:\+?972[-\s]?|0)5\d(?:[-\s]?\d){7}/;
const TIME = new RegExp(`${START}(?:ב-?|בשעה\\s*)?(\\d{1,2})(?::(\\d{2}))?(?:\\s*בבוקר|\\s*בערב|\\s*בצהריים)?${END}`);
const AMOUNT = new RegExp(`${START}(\\d{1,3}(?:,\\d{3})+|\\d+)(?:\\.(\\d{1,2}))?\\s*(?:₪|ש"ח|ש״ח|שח|שקלים|שקל)?${END}`);
const SERVICE = new RegExp(`${START}(?:על|עבור|בשביל)\\s+(.+)$`);

function clean(s: string) {
  return s.replace(/\s+/g, " ").trim();
}

/** "לדנה כהן" → "דנה כהן". Only strips a leading ל/מ/ש when a name follows. */
function stripPrefix(word: string) {
  return /^[למש][֐-׿]{2,}/.test(word) ? word.slice(1) : word;
}

function nameFrom(rest: string) {
  const words = clean(rest)
    .split(" ")
    .filter((w) => w && !/^(את|עם|של|ל|על|עבור|חדש|חדשה|ב|ביום|בשעה)$/.test(w));
  if (!words.length) return null;
  words[0] = stripPrefix(words[0]);
  return words.slice(0, 3).join(" ") || null;
}

/** Pulls a date word out of the text. Returns the date (yyyy-mm-dd) and the text without it. */
export function extractDate(text: string, now = israelNow()): { date: string | null; rest: string } {
  const day = (offset: number) => {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset);
    return isoDate(d);
  };
  const rules: [RegExp, () => string][] = [
    [new RegExp(`${START}מחרתיים${END}`), () => day(2)],
    [new RegExp(`${START}מחר${END}`), () => day(1)],
    [new RegExp(`${START}היום${END}`), () => day(0)],
  ];
  for (const [re, fn] of rules) {
    if (re.test(text)) return { date: fn(), rest: clean(text.replace(re, " ")) };
  }
  const weekday = new RegExp(`${START}(?:ב?יום\\s+)?(${WEEKDAYS.join("|")})${END}`);
  const w = text.match(weekday);
  if (w) {
    const target = WEEKDAYS.indexOf(w[1]);
    let diff = (target - now.getDay() + 7) % 7;
    if (diff === 0) diff = 7;
    return { date: day(diff), rest: clean(text.replace(w[0], " ")) };
  }
  const dm = text.match(new RegExp(`${START}(?:ב-?)?(\\d{1,2})[./](\\d{1,2})(?:[./](\\d{2,4}))?${END}`));
  if (dm) {
    const d = Number(dm[1]);
    const m = Number(dm[2]);
    let y = dm[3] ? Number(dm[3]) : now.getFullYear();
    if (y < 100) y += 2000;
    if (d >= 1 && d <= 31 && m >= 1 && m <= 12) {
      let date = new Date(y, m - 1, d);
      // "15/3" without a year in the past means next year.
      if (!dm[3] && date < new Date(now.getFullYear(), now.getMonth(), now.getDate())) date = new Date(y + 1, m - 1, d);
      return { date: isoDate(date), rest: clean(text.replace(dm[0], " ")) };
    }
  }
  return { date: null, rest: text };
}

function extractTime(text: string): { time: string | null; rest: string } {
  const t = text.match(TIME);
  if (!t) return { time: null, rest: text };
  let h = Number(t[1]);
  const m = t[2] ? Number(t[2]) : 0;
  if (/בערב/.test(t[0]) && h < 12) h += 12;
  // "ב-3" with no context most likely means the afternoon in a business day.
  if (!/בבוקר/.test(t[0]) && h >= 1 && h <= 6) h += 12;
  if (h > 23 || m > 59) return { time: null, rest: text };
  return { time: `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`, rest: clean(text.replace(t[0], " ")) };
}

function extractPhone(text: string): { phone: string | null; rest: string } {
  const p = text.match(PHONE);
  if (!p) return { phone: null, rest: text };
  return { phone: p[0].replace(/[\s-]/g, ""), rest: clean(text.replace(p[0], " ")) };
}

function extractAmount(text: string): { amount: number | null; rest: string } {
  const a = text.match(AMOUNT);
  if (!a) return { amount: null, rest: text };
  const value = Number(`${a[1].replace(/,/g, "")}${a[2] ? `.${a[2]}` : ""}`);
  if (!Number.isFinite(value) || value <= 0) return { amount: null, rest: text };
  return { amount: value, rest: clean(text.replace(a[0], " ")) };
}

function extractService(text: string): { service: string | null; rest: string } {
  const s = text.match(SERVICE);
  if (!s) return { service: null, rest: text };
  return { service: clean(s[1]) || null, rest: clean(text.replace(s[0], " ")) };
}

/** The business's own nouns, so "מטופלים" opens the customers page and "מטופל חדש" adds one. */
export type CommandTerms = { customer: string; customers: string; deal: string; deals: string };

function pagesFor(terms?: CommandTerms) {
  if (!terms) return PAGES;
  const own: Record<string, { words: string[]; label: string }> = {
    "/customers": { words: [terms.customers, terms.customer], label: terms.customers },
    "/deals": { words: [terms.deals, terms.deal], label: terms.deals },
  };
  return PAGES.map((p) => (own[p.href] ? { ...p, words: [...own[p.href].words, ...p.words], label: own[p.href].label } : p));
}

function matchPage(text: string, terms?: CommandTerms) {
  const t = text.replace(/^ה(?=[֐-׿]{3,})/, "");
  return pagesFor(terms).find((p) => p.words.some((w) => w === text || w === t));
}

function matchModule(text: string, modules: ModuleRef[]) {
  const t = clean(text.replace(new RegExp(`${START}(?:את|למסך|מודול|כלי)${END}`, "g"), " "));
  if (!t) return null;
  return (
    modules.find((m) => m.name === t) ??
    modules.find((m) => m.name.includes(t) || t.includes(m.name)) ??
    modules.find((m) => t.split(" ").some((w) => w.length > 2 && m.name.includes(w))) ??
    null
  );
}

/**
 * @param words extra appointment trigger words — the business's own (see appointmentWords(terms)).
 * @param terms the business's nouns, for "<customer> חדש" and page names.
 */
export function parseCommand(input: string, modules: ModuleRef[] = [], now = israelNow(), words: string[] = [], terms?: CommandTerms): Command {
  const text = clean(input);
  if (!text) return { kind: "search", query: "" };
  const APPOINTMENT = appointmentRe(words);
  const CUSTOMER = customerRe(terms ? [terms.customer] : []);

  if (SALE.test(text)) {
    let rest = text.replace(SALE, " ");
    const s = extractService(rest);
    rest = s.rest;
    const a = extractAmount(rest);
    return { kind: "sale", amount: a.amount, name: nameFrom(a.rest), service: s.service };
  }

  if (APPOINTMENT.test(text)) {
    let rest = text.replace(APPOINTMENT, " ");
    const d = extractDate(rest, now);
    rest = d.rest;
    const t = extractTime(rest);
    rest = t.rest;
    const s = extractService(rest);
    return { kind: "appointment", name: nameFrom(s.rest), date: d.date, time: t.time, service: s.service };
  }

  if (CUSTOMER.test(text) && !matchPage(text, terms)) {
    const p = extractPhone(text.replace(CUSTOMER, " "));
    return { kind: "customer", name: nameFrom(p.rest), phone: p.phone };
  }

  if (TASK.test(text) || /^להתקשר|^לחזור ל/.test(text)) {
    const d = extractDate(text.replace(TASK, " "), now);
    const title = clean(d.rest);
    if (title) return { kind: "task", title, date: d.date };
  }

  if (ADD_MODULE.test(text)) {
    const m = matchModule(text.replace(ADD_MODULE, " "), modules);
    if (m) return { kind: "add-module", id: m.id, name: m.name };
  }

  const openTarget = OPEN.test(text) ? clean(text.replace(OPEN, " ")) : text;
  const page = matchPage(openTarget, terms);
  if (page) return { kind: "open", href: page.href, label: page.label };

  if (text.endsWith("?") || QUESTION.test(text)) return { kind: "ask", question: text };

  return { kind: "search", query: text };
}
