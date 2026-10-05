/** Hebrew display labels for DB enum values. DB values stay in English. */
import type { DealStage } from "@/types/domain";

export const STAGE_LABELS: Record<DealStage, string> = {
  new: "חדשה",
  contacted: "נוצר קשר",
  qualified: "רלוונטית",
  proposal: "נשלחה הצעה",
  negotiation: "במשא ומתן",
  won: "נסגרה בהצלחה",
  lost: "לא נסגרה",
};

export const CUSTOMER_STATUS_LABELS: Record<string, string> = {
  active: "פעיל",
  inactive: "לא פעיל",
  churned: "עזב",
};

export const LEAD_STATUS_LABELS: Record<string, string> = {
  new: "חדשה",
  contacted: "נוצר קשר",
  qualified: "רלוונטית",
  converted: "הפכה ללקוח",
  lost: "לא רלוונטית",
};

export const TRANSACTION_TYPE_LABELS: Record<string, string> = {
  sale: "מכירה",
  refund: "החזר",
  subscription: "מנוי",
};

export const TRANSACTION_STATUS_LABELS: Record<string, string> = {
  paid: "שולם",
  pending: "ממתין לתשלום",
  cancelled: "בוטל",
};

export const ACTIVITY_TYPE_LABELS: Record<string, string> = {
  appointment: "תור",
  call: "שיחה",
  meeting: "פגישה",
  email: "אימייל",
  note: "הערה",
  visit: "ביקור",
};

export const TASK_STATUS_LABELS: Record<string, string> = {
  open: "פתוחה",
  done: "בוצעה",
};

export const ROLE_LABELS: Record<string, string> = {
  owner: "בעלים",
  admin: "מנהל",
  member: "חבר צוות",
};

export const BUSINESS_TYPE_LABELS: Record<string, string> = {
  service: "עסק נותן שירות",
  sales: "עסק שמוכר מוצרים",
  both: "גם וגם",
};

/** Falls back to the raw value so an unexpected DB value is still visible. */
export function label(map: Record<string, string>, value: string | null | undefined) {
  if (!value) return "—";
  return map[value] ?? value;
}
