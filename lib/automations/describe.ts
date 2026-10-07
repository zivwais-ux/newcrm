import { DEFAULT_TERMS, type Terms } from "@/lib/terms";
import type { Action, Automation, Condition, Subject, Trigger } from "./schema";

// Every automation reads as one Hebrew sentence, in the business's own words.

export interface DescribeContext {
  terms?: Terms;
  stageLabel?: (key: string) => string;
  fieldLabel?: (key: string) => string;
}

/** Quotes a text; uses «» when it already contains double quotes, so nothing gets double-wrapped. */
const quote = (text: string) => (text.includes('"') ? `«${text}»` : `"${text}"`);
const daysText = (n: number) => (n === 0 ? "באותו יום" : n === 1 ? "יום אחד" : `${n} ימים`);

export function subjectNoun(s: Subject, t: Terms): string {
  return { customers: t.customer, transactions: t.sale, activities: t.appointment, leads: "פנייה", deals: t.deal, tasks: "משימה" }[s];
}

const STATUS_WORDS: Record<string, string> = {
  new: "חדשה",
  contacted: "נוצר קשר",
  qualified: "רלוונטית",
  converted: "הפכה ללקוח",
  lost: "לא רלוונטית",
  paid: "שולם",
  pending: "ממתין לתשלום",
  cancelled: "בוטל",
  refunded: "הוחזר",
  active: "פעיל",
  inactive: "לא פעיל",
  churned: "עזב",
  open: "פתוחה",
  done: "בוצעה",
};

export function describeTrigger(tr: Trigger, ctx: DescribeContext = {}): string {
  const t = ctx.terms ?? DEFAULT_TERMS;
  switch (tr.type) {
    case "record_created":
      return `כאשר נוספ/ה ${subjectNoun(tr.entity, t)}`.replace("נוספ/ה", tr.entity === "customers" ? "נוסף" : "נוספה");
    case "deal_stage":
      return `כאשר ${t.deal} עוברת לשלב "${ctx.stageLabel?.(tr.stage) ?? tr.stage}"`;
    case "status_changed":
      return `כאשר ${tr.entity === "leads" ? "פנייה" : t.sale} משנה סטטוס ל"${STATUS_WORDS[tr.status] ?? tr.status}"`;
    case "days_from_date": {
      const anchor =
        tr.anchor === "last_purchase"
          ? "הקנייה האחרונה"
          : tr.anchor === "appointment"
            ? `ה${t.appointment}`
            : `"${tr.field ? (ctx.fieldLabel?.(tr.field) ?? "התאריך") : "התאריך"}"`;
      return tr.days === 0 ? `ביום של ${anchor}` : `${daysText(tr.days)} ${tr.before ? "לפני" : "אחרי"} ${anchor}`;
    }
    case "no_activity":
      return `כאשר ${tr.entity === "customers" ? t.customer : t.deal} בלי פעילות ${daysText(tr.days)}`;
  }
}

const FIELD_WORDS: Record<string, string> = {
  status: "הסטטוס",
  has_phone: "יש טלפון",
  purchases: "מספר הקניות",
  total_revenue: "סך הקניות",
  days_since_purchase: "ימים מהקנייה האחרונה",
  amount: "הסכום",
  service: "השירות",
  is_first_purchase: "קנייה ראשונה",
  type: "הסוג",
  source: "המקור",
  stage: "השלב",
  value: "השווי",
};

const OP_WORDS: Record<Condition["op"], string> = {
  eq: "הוא",
  neq: "אינו",
  gt: "גדול מ-",
  lt: "קטן מ-",
  contains: "מכיל",
  empty: "ריק",
  not_empty: "מלא",
};

export function describeCondition(c: Condition, ctx: DescribeContext = {}): string {
  const t = ctx.terms ?? DEFAULT_TERMS;
  if (c.field === "has_phone") return c.op === "neq" || c.value === "false" ? "ואין לו טלפון" : "ויש לו טלפון";
  if (c.field === "is_first_purchase") return c.op === "neq" || c.value === "false" ? "ולא קנייה ראשונה" : "וזו הקנייה הראשונה";
  const name = c.field.startsWith("cf:") ? `"${ctx.fieldLabel?.(c.field.slice(3)) ?? "שדה"}"` : (FIELD_WORDS[c.field] ?? c.field).replace("השירות", `ה${t.service}`);
  const value =
    c.field === "stage"
      ? (ctx.stageLabel?.(c.value) ?? c.value)
      : c.value === "true"
        ? "כן"
        : c.value === "false"
          ? "לא"
          : (STATUS_WORDS[c.value] ?? c.value);
  if (c.op === "empty" || c.op === "not_empty") return `ו${name} ${OP_WORDS[c.op]}`;
  return `ו${name} ${OP_WORDS[c.op]}${c.op === "gt" || c.op === "lt" ? "" : " "}${value}`;
}

export function describeAction(a: Action, ctx: DescribeContext = {}): string {
  const t = ctx.terms ?? DEFAULT_TERMS;
  switch (a.type) {
    case "create_task":
      return `צור משימה ${quote(a.title)}${a.due_in_days === 1 ? " למחר" : a.due_in_days ? ` בעוד ${a.due_in_days} ימים` : ""}`;
    case "prepare_whatsapp":
      return "הכן הודעת WhatsApp לשליחה";
    case "add_note":
      return `הוסף הערה ל${t.customer}`;
    case "notify":
      return `שלח לי התראה: ${quote(a.title)}`;
    case "set_value":
      return a.target === "deal_stage"
        ? `העבר את ה${t.deal} לשלב "${ctx.stageLabel?.(a.value) ?? a.value}"`
        : a.target === "custom_field"
          ? `עדכן "${a.field ? (ctx.fieldLabel?.(a.field) ?? "שדה") : "שדה"}" ל-${a.value}`
          : `עדכן סטטוס ל"${STATUS_WORDS[a.value] ?? a.value}"`;
  }
}

/** The whole automation as one readable sentence. */
export function describeAutomation(a: Pick<Automation, "trigger" | "conditions" | "wait" | "actions">, ctx: DescribeContext = {}): string {
  const parts = [describeTrigger(a.trigger, ctx)];
  for (const c of a.conditions) parts.push(describeCondition(c, ctx));
  const wait = a.wait.days || a.wait.hours ? `חכה ${[a.wait.days ? daysText(a.wait.days) : "", a.wait.hours ? `${a.wait.hours} שעות` : ""].filter(Boolean).join(" ו-")}` : "";
  if (wait) parts.push(wait);
  parts.push(`אז ${a.actions.map((x) => describeAction(x, ctx)).join(" ו")}`);
  return parts.join(" ← ");
}
