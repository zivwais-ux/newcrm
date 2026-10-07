// The business's own words. Every business names things differently ("מטופל" instead of "לקוח",
// "טיפול" instead of "תור"), so the UI never hardcodes these nouns — it reads them from here.

export const TERM_KEYS = [
  "customer",
  "customers",
  "appointment",
  "appointments",
  "service",
  "services",
  "deal",
  "deals",
  "sale",
  "sales",
] as const;
export type TermKey = (typeof TERM_KEYS)[number];
export type Terms = Record<TermKey, string>;

export const DEFAULT_TERMS: Terms = {
  customer: "לקוח",
  customers: "לקוחות",
  appointment: "תור",
  appointments: "תורים",
  service: "שירות",
  services: "שירותים",
  deal: "עסקה",
  deals: "עסקאות",
  sale: "מכירה",
  sales: "מכירות",
};

/** The pairs people choose in settings and onboarding (singular + plural edited together). */
export const TERM_GROUPS: { singular: TermKey; plural: TermKey; question: string; suggestions: [string, string][] }[] = [
  {
    singular: "customer",
    plural: "customers",
    question: "איך קוראים אצלך לאנשים שקונים ממך?",
    suggestions: [
      ["לקוח", "לקוחות"],
      ["לקוחה", "לקוחות"],
      ["מטופל", "מטופלים"],
      ["מתאמן", "מתאמנים"],
      ["תלמיד", "תלמידים"],
      ["מנוי", "מנויים"],
    ],
  },
  {
    singular: "appointment",
    plural: "appointments",
    question: "ואיך נקרא מפגש קבוע מראש?",
    suggestions: [
      ["תור", "תורים"],
      ["טיפול", "טיפולים"],
      ["פגישה", "פגישות"],
      ["שיעור", "שיעורים"],
      ["אימון", "אימונים"],
      ["ביקור", "ביקורים"],
      ["עבודה", "עבודות"],
      ["הזמנה", "הזמנות"],
    ],
  },
  {
    singular: "service",
    plural: "services",
    question: "ומה אתה מוכר?",
    suggestions: [
      ["שירות", "שירותים"],
      ["טיפול", "טיפולים"],
      ["מוצר", "מוצרים"],
      ["שיעור", "שיעורים"],
      ["חבילה", "חבילות"],
      ["פרויקט", "פרויקטים"],
    ],
  },
  {
    singular: "deal",
    plural: "deals",
    question: "ואיך נקרא משהו שעוד לא נסגר?",
    suggestions: [
      ["עסקה", "עסקאות"],
      ["הצעת מחיר", "הצעות מחיר"],
      ["פרויקט", "פרויקטים"],
      ["הזדמנות", "הזדמנויות"],
    ],
  },
];

const clean = (v: unknown) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, 30) : "");

/** Merge saved overrides over the defaults; anything blank or invalid falls back. */
export function resolveTerms(saved: unknown): Terms {
  const src = saved && typeof saved === "object" ? (saved as Record<string, unknown>) : {};
  const out = { ...DEFAULT_TERMS };
  for (const k of TERM_KEYS) {
    const v = clean(src[k]);
    if (v) out[k] = v;
  }
  return out;
}

/** Keep only the overrides that differ from the defaults (what gets stored). */
export function compactTerms(terms: Partial<Record<TermKey, string>>): Partial<Terms> {
  const out: Partial<Terms> = {};
  for (const k of TERM_KEYS) {
    const v = clean(terms[k]);
    if (v && v !== DEFAULT_TERMS[k]) out[k] = v;
  }
  return out;
}

/** "{customer}" style placeholders in copy → the business's words. */
export function withTerms(text: string, terms: Terms) {
  return text.replace(/\{(\w+)\}/g, (m, k: string) => (k in terms ? terms[k as TermKey] : m));
}

/** Every appointment-like word the business might type (their own + the common ones). */
export function appointmentWords(terms: Terms) {
  const common = ["תור", "פגישה", "טיפול", "שיעור", "אימון", "ביקור"];
  return [...new Set([terms.appointment, ...common])].filter(Boolean);
}
