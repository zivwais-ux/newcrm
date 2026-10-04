// Value parsing & normalization for imported cells. Pure functions.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function clean(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? "" : value.toISOString().slice(0, 10);
  return String(value).replace(/ /g, " ").trim();
}

export function normalizeEmail(value: unknown): string | null {
  const v = clean(value).toLowerCase();
  return EMAIL_RE.test(v) ? v : null;
}

export function isEmail(value: unknown) {
  return normalizeEmail(value) !== null;
}

/** Keeps a leading + and digits. Returns null when it doesn't look like a phone. */
export function normalizePhone(value: unknown): string | null {
  const raw = clean(value);
  if (!raw) return null;
  const digits = raw.replace(/[^\d+]/g, "");
  const count = digits.replace(/\D/g, "").length;
  if (count < 7 || count > 15) return null;
  return digits.startsWith("+") ? `+${digits.replace(/\D/g, "")}` : digits.replace(/\D/g, "");
}

export function isPhone(value: unknown) {
  const raw = clean(value);
  if (!/^[\d\s()+\-.]+$/.test(raw)) return false;
  return normalizePhone(raw) !== null && /[\s\-()+]|^0/.test(raw);
}

export function normalizeName(value: unknown): string {
  return clean(value).replace(/\s+/g, " ");
}

/** Key used to match the same customer across rows and against the database. */
export function nameKey(value: unknown): string {
  return normalizeName(value).toLowerCase();
}

/**
 * Parses money: "₪1,200.50", "$ 300", "1200", "(150)" → number.
 * Returns null for non-numeric input.
 */
export function parseMoney(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  let v = clean(value);
  if (!v) return null;
  let negative = false;
  if (/^\(.*\)$/.test(v)) {
    negative = true;
    v = v.slice(1, -1);
  }
  v = v.replace(/[₪$€£]|ils|nis|usd|eur|ש"ח|שח/gi, "").replace(/\s/g, "");
  if (v.startsWith("-")) {
    negative = true;
    v = v.slice(1);
  }
  // European style 1.234,56
  if (/^\d{1,3}(\.\d{3})+,\d{1,2}$/.test(v)) v = v.replace(/\./g, "").replace(",", ".");
  else v = v.replace(/,/g, "");
  if (!/^\d+(\.\d+)?$/.test(v)) return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return negative ? -n : n;
}

export type DateOrder = "dmy" | "mdy";

/** Infers day/month order from a sample of slash/dot dates. Defaults to day-first. */
export function inferDateOrder(values: unknown[]): DateOrder {
  let dmy = 0;
  let mdy = 0;
  for (const value of values) {
    const m = clean(value).match(/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{2,4})/);
    if (!m) continue;
    const a = Number(m[1]);
    const b = Number(m[2]);
    if (a > 12 && b <= 12) dmy++;
    if (b > 12 && a <= 12) mdy++;
  }
  return mdy > dmy ? "mdy" : "dmy";
}

function validYmd(y: number, m: number, d: number): string | null {
  if (y < 1900 || y > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return null;
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCMonth() !== m - 1) return null;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** Parses many date shapes into yyyy-mm-dd. Excel serials are supported. */
export function parseDate(value: unknown, order: DateOrder = "dmy"): string | null {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString().slice(0, 10);
  }
  if (typeof value === "number") return excelSerialToIso(value);
  const v = clean(value);
  if (!v) return null;

  let m = v.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[ T].*)?$/);
  if (m) return validYmd(Number(m[1]), Number(m[2]), Number(m[3]));

  m = v.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})(?:[ T].*)?$/);
  if (m) {
    let y = Number(m[3]);
    if (y < 100) y += y > 50 ? 1900 : 2000;
    const a = Number(m[1]);
    const b = Number(m[2]);
    return order === "dmy" ? validYmd(y, b, a) ?? validYmd(y, a, b) : validYmd(y, a, b) ?? validYmd(y, b, a);
  }

  if (/^\d{5}(\.\d+)?$/.test(v)) return excelSerialToIso(Number(v));

  // "12 Mar 2025", "March 12, 2025"
  if (/[a-z]/i.test(v)) {
    const t = Date.parse(v);
    if (!Number.isNaN(t)) {
      const d = new Date(t);
      return validYmd(d.getFullYear(), d.getMonth() + 1, d.getDate());
    }
  }
  return null;
}

export function excelSerialToIso(serial: number): string | null {
  if (!Number.isFinite(serial) || serial < 20000 || serial > 80000) return null;
  const ms = Math.round((serial - 25569) * 86_400_000);
  return new Date(ms).toISOString().slice(0, 10);
}

const STAGE_SYNONYMS: Record<string, string> = {
  new: "new", open: "new", lead: "new", "חדש": "new",
  contacted: "contacted", "in contact": "contacted", "נוצר קשר": "contacted",
  qualified: "qualified", "מתאים": "qualified",
  proposal: "proposal", "proposal sent": "proposal", quote: "proposal", "הצעת מחיר": "proposal", "הצעה": "proposal",
  negotiation: "negotiation", negotiating: "negotiation", "משא ומתן": "negotiation",
  won: "won", "closed won": "won", closed: "won", "נסגר": "won", "זכייה": "won",
  lost: "lost", "closed lost": "lost", "הפסד": "lost", "אבוד": "lost",
};

export function normalizeStage(value: unknown): string {
  return STAGE_SYNONYMS[clean(value).toLowerCase()] ?? "new";
}

export function normalizeLeadStatus(value: unknown): string {
  const v = clean(value).toLowerCase();
  if (["contacted", "in progress", "working", "נוצר קשר", "בטיפול"].includes(v)) return "contacted";
  if (["qualified", "hot", "מתאים", "חם"].includes(v)) return "qualified";
  if (["converted", "won", "customer", "הומר", "לקוח"].includes(v)) return "converted";
  if (["lost", "dead", "closed", "unqualified", "אבוד", "לא רלוונטי"].includes(v)) return "lost";
  return "new";
}

export function normalizeTxStatus(value: unknown): string {
  const v = clean(value).toLowerCase();
  if (["pending", "unpaid", "open", "due", "ממתין", "לא שולם"].includes(v)) return "pending";
  if (["cancelled", "canceled", "void", "בוטל"].includes(v)) return "cancelled";
  if (["refunded", "refund", "הוחזר", "זיכוי"].includes(v)) return "refunded";
  return "paid";
}

export function normalizeTxType(value: unknown): string {
  const v = clean(value).toLowerCase();
  if (["refund", "credit", "return", "זיכוי", "החזר"].includes(v)) return "refund";
  if (["subscription", "recurring", "מנוי", "חודשי"].includes(v)) return "subscription";
  return "sale";
}

export function normalizeActivityType(value: unknown): string {
  const v = clean(value).toLowerCase();
  if (/call|phone|שיחה/.test(v)) return "call";
  if (/meet|פגישה/.test(v)) return "meeting";
  if (/mail|מייל/.test(v)) return "email";
  if (/visit|ביקור/.test(v)) return "visit";
  if (/note|הערה/.test(v)) return "note";
  return "appointment";
}

export function normalizeCustomerStatus(value: unknown): string {
  const v = clean(value).toLowerCase();
  if (["inactive", "לא פעיל", "paused"].includes(v)) return "inactive";
  if (["churned", "lost", "former", "עזב"].includes(v)) return "churned";
  return "active";
}
