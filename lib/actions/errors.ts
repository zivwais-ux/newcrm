import type { PostgrestError } from "@supabase/supabase-js";
import type { ActionResult } from "@/types/domain";

/** Maps database/auth errors to human-readable messages. Never exposes raw errors. */
export function friendlyError(error: PostgrestError | Error | { message?: string; code?: string } | null | undefined): string {
  const code = (error as { code?: string } | null)?.code;
  switch (code) {
    case "42501":
      return "אין לך הרשאה לעשות את זה בחשבון הזה.";
    case "23505":
      return "כבר קיימת רשומה עם הפרטים האלה.";
    case "23502":
      return "חסרים פרטים חובה.";
    case "23503":
      return "הרשומה מקושרת למשהו שכבר לא קיים.";
    case "23514":
    case "22P02":
      return "חלק מהערכים לא בפורמט הנכון.";
    case "PGRST116":
      return "לא מצאנו את הרשומה.";
  }
  if (error) console.error("[action]", code, error.message);
  return "משהו השתבש. נסה שוב.";
}

export function fail(error: string): ActionResult<never> {
  return { ok: false, error };
}

export function ok<T>(data: T): ActionResult<T> {
  return { ok: true, data };
}
