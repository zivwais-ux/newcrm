import type { PostgrestError } from "@supabase/supabase-js";
import type { ActionResult } from "@/types/domain";

/** Maps database/auth errors to human-readable messages. Never exposes raw errors. */
export function friendlyError(error: PostgrestError | Error | { message?: string; code?: string } | null | undefined): string {
  const code = (error as { code?: string } | null)?.code;
  switch (code) {
    case "42501":
      return "You don't have permission to do that in this workspace.";
    case "23505":
      return "A record with these details already exists.";
    case "23502":
      return "Some required information is missing.";
    case "23503":
      return "This record is linked to something that no longer exists.";
    case "23514":
    case "22P02":
      return "Some values aren't in the expected format.";
    case "PGRST116":
      return "We couldn't find that record.";
  }
  if (error) console.error("[action]", code, error.message);
  return "Something went wrong. Please try again.";
}

export function fail(error: string): ActionResult<never> {
  return { ok: false, error };
}

export function ok<T>(data: T): ActionResult<T> {
  return { ok: true, data };
}
