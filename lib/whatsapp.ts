// WhatsApp click-to-chat helpers. Pure functions, safe on server and client.
import { DEFAULT_TERMS, type Terms } from "./terms";

export interface MessageTemplate {
  id: string;
  name: string;
  body: string;
}

/** Built-in templates in the business's own words, used until the business saves its own. */
export function defaultTemplates(terms: Pick<Terms, "appointment"> = DEFAULT_TERMS): MessageTemplate[] {
  return [
    { id: "default-hello", name: "הודעה חופשית", body: "היי {שם}, " },
    { id: "default-miss", name: "לא ראינו אותך מזמן", body: "היי {שם}, מה שלומך? לא ראינו אותך כבר תקופה ב{עסק} ונשמח לראות אותך שוב. מתי נוח לך? 😊" },
    { id: "default-reminder", name: `תזכורת: ${terms.appointment}`, body: `היי {שם}, רק מזכירים את ה${terms.appointment} שלך ב{עסק}. נתראה! אם צריך לשנות — כתוב לנו כאן.` },
    { id: "default-thanks", name: "תודה על הביקור", body: "היי {שם}, תודה שבחרת ב{עסק}! נשמח לשמוע איך היה." },
    { id: "default-payment", name: "תזכורת תשלום", body: "היי {שם}, רק תזכורת קטנה לגבי התשלום על {שירות}. תודה!" },
  ];
}

/** Names to look for when preselecting the appointment reminder (the business's word, then older names). */
export function reminderTemplate(terms: Pick<Terms, "appointment"> = DEFAULT_TERMS) {
  return [`תזכורת: ${terms.appointment}`, "default-reminder", "תזכורת לתור"];
}

/** Built-in templates with the default words (kept for compatibility). */
export const DEFAULT_TEMPLATES: MessageTemplate[] = defaultTemplates(DEFAULT_TERMS);

/**
 * Normalizes an Israeli or international phone to WhatsApp's digits-only format.
 * "050-123-4567" → "972501234567"; "+44 7700 900123" → "447700900123".
 * Returns null when it isn't a plausible mobile number.
 */
export function toWhatsAppNumber(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const raw = String(phone).trim();
  let digits = raw.replace(/\D/g, "");
  if (!digits) return null;
  if (raw.startsWith("+")) {
    // already international
  } else if (digits.startsWith("00")) {
    digits = digits.slice(2);
  } else if (digits.startsWith("972")) {
    // international without "+"
  } else if (digits.startsWith("0")) {
    digits = `972${digits.slice(1)}`;
  } else if (digits.length === 9 && digits.startsWith("5")) {
    digits = `972${digits}`; // "501234567" with the leading 0 dropped by Excel
  }
  if (digits.startsWith("9720")) digits = `972${digits.slice(4)}`;
  if (digits.length < 10 || digits.length > 15) return null;
  return digits;
}

/** Fills {שם}, {שם פרטי}, {עסק}, {שירות} (and English aliases) in a template. */
export function fillTemplate(body: string, vars: { name?: string | null; business?: string | null; service?: string | null }) {
  const name = (vars.name ?? "").trim();
  const first = name.split(/\s+/)[0] ?? "";
  return body
    .replace(/\{(שם פרטי|first)\}/g, first)
    .replace(/\{(שם|name)\}/g, first || name)
    .replace(/\{(עסק|business)\}/g, (vars.business ?? "").trim())
    .replace(/\{(שירות|service)\}/g, (vars.service ?? "").trim() || "השירות")
    .replace(/[ \t]{2,}/g, " ");
}

export function whatsAppLink(phone: string | null | undefined, text = ""): string | null {
  const n = toWhatsAppNumber(phone);
  if (!n) return null;
  return text ? `https://wa.me/${n}?text=${encodeURIComponent(text)}` : `https://wa.me/${n}`;
}
