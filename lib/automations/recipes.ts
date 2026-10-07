import { DEFAULT_TERMS, type Terms } from "@/lib/terms";
import type { Automation } from "./schema";

// Ready-made flows: one tap turns them on, and they can be edited after.

export interface Recipe {
  key: string;
  title: string;
  /** One line on why it helps, in the business's words. */
  why: string;
  build: (t: Terms) => Automation;
}

export const RECIPES: Recipe[] = [
  {
    key: "thank_first_purchase",
    title: "תודה אחרי קנייה ראשונה",
    why: "מי שמקבל תודה אישית חוזר יותר.",
    build: (t) => ({
      name: "תודה אחרי קנייה ראשונה",
      trigger: { type: "record_created", entity: "transactions" },
      conditions: [
        { field: "is_first_purchase", op: "eq", value: "true" },
        { field: "has_phone", op: "eq", value: "true" },
      ],
      wait: { days: 1, hours: 0 },
      actions: [{ type: "prepare_whatsapp", body: `היי {שם}, תודה שבחרת ב{עסק}. שמחנו מאוד, ומחכים לראות אותך שוב.` }],
    }),
  },
  {
    key: "win_back",
    title: `${DEFAULT_TERMS.customer} לא חזר`,
    why: "תזכורת קטנה בזמן הנכון מחזירה אנשים.",
    build: (t) => ({
      name: `${t.customer} שלא חזר 45 יום`,
      trigger: { type: "days_from_date", anchor: "last_purchase", days: 45, before: false },
      conditions: [{ field: "has_phone", op: "eq", value: "true" }],
      wait: { days: 0, hours: 0 },
      actions: [
        { type: "prepare_whatsapp", body: `היי {שם}, התגעגענו! עבר זמן מאז הפעם האחרונה. רוצה לקבוע ${t.appointment}?` },
        { type: "create_task", title: `לחזור ל{שם}`, due_in_days: 2 },
      ],
    }),
  },
  {
    key: "appointment_reminder",
    title: "תזכורת יום לפני",
    why: "פחות ביטולים ופחות מי שלא מגיעים.",
    build: (t) => ({
      name: `תזכורת יום לפני ${t.appointment}`,
      trigger: { type: "days_from_date", anchor: "appointment", days: 1, before: true },
      conditions: [{ field: "has_phone", op: "eq", value: "true" }],
      wait: { days: 0, hours: 0 },
      actions: [{ type: "prepare_whatsapp", body: `היי {שם}, תזכורת: נתראה מחר ב-{שעה} ב{עסק}. אם משהו השתנה, פשוט תכתוב לנו.` }],
    }),
  },
  {
    key: "new_lead_followup",
    title: "פנייה חדשה ← לחזור תוך יום",
    why: "מי שעונה ראשון, סוגר.",
    build: () => ({
      name: "לחזור לפנייה חדשה",
      trigger: { type: "record_created", entity: "leads" },
      conditions: [],
      wait: { days: 0, hours: 0 },
      actions: [
        { type: "create_task", title: "לחזור לפנייה של {שם}", due_in_days: 1 },
        { type: "notify", title: "נכנסה פנייה חדשה מ{שם}" },
      ],
    }),
  },
  {
    key: "stuck_deal",
    title: "תקוע שבוע ← משימה",
    why: "שום הזדמנות לא נשכחת.",
    build: (t) => ({
      name: `${t.deal} תקועה 7 ימים`,
      trigger: { type: "no_activity", entity: "deals", days: 7 },
      conditions: [],
      wait: { days: 0, hours: 0 },
      actions: [{ type: "create_task", title: `לקדם את "{שם}"`, due_in_days: 0 }],
    }),
  },
  {
    key: "pending_payment",
    title: "תשלום ממתין ← תזכורת",
    why: "כסף שמחכה — נכנס מהר יותר.",
    build: (t) => ({
      name: "תזכורת תשלום אחרי 3 ימים",
      trigger: { type: "status_changed", entity: "transactions", status: "pending" },
      conditions: [{ field: "has_phone", op: "eq", value: "true" }],
      wait: { days: 3, hours: 0 },
      actions: [
        { type: "prepare_whatsapp", body: `היי {שם}, תזכורת קטנה לגבי התשלום על {שירות} ({סכום}). תודה!` },
        { type: "create_task", title: `לבדוק תשלום של {שם} על ${t.sale}`, due_in_days: 0 },
      ],
    }),
  },
  {
    key: "won_deal",
    title: "נסגר ← לרשום מכירה",
    why: "ההכנסות תמיד מעודכנות.",
    build: (t) => ({
      name: `${t.deal} נסגרה בהצלחה`,
      trigger: { type: "deal_stage", stage: "won" },
      conditions: [],
      wait: { days: 0, hours: 0 },
      actions: [
        { type: "create_task", title: `לרשום ${t.sale} עבור "{שם}"`, due_in_days: 0 },
        { type: "notify", title: `סגרת את "{שם}"` },
      ],
    }),
  },
  {
    key: "birthday",
    title: "ברכה ביום ההולדת",
    why: "מחווה קטנה שזוכרים.",
    build: () => ({
      name: "ברכת יום הולדת",
      // Needs a date field of the business's own ("יום הולדת"); the gallery asks to pick it.
      trigger: { type: "days_from_date", anchor: "custom_date", field: "f_birthday", days: 0, before: false },
      conditions: [{ field: "has_phone", op: "eq", value: "true" }],
      wait: { days: 0, hours: 0 },
      actions: [{ type: "prepare_whatsapp", body: "היי {שם}, מזל טוב! מאחלים לך שנה נהדרת. באהבה, {עסק}" }],
    }),
  },
];

export const recipeByKey = (key: string) => RECIPES.find((r) => r.key === key);
