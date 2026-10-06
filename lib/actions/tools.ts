"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireOrg } from "@/lib/supabase/server";
import { israelDay } from "@/lib/analytics/dates";
import type { ActionResult } from "@/types/domain";
import { fail, friendlyError, ok } from "./errors";

// Quick actions used by the canvas tools (tasks, today, follow-up radar).
// Every write goes through the user-scoped client (RLS enforces tenancy) and is
// verified with .select("id") so a silent "0 rows changed" never reports success.

const uuid = z.string().uuid();

function refresh() {
  revalidatePath("/", "layout");
}

/** Israel calendar date of tomorrow, "yyyy-mm-dd" (DST-safe: noon of the next Israel day). */
function israelTomorrow() {
  const today = israelDay();
  return israelDay(new Date(new Date(today.end).getTime() + 12 * 3_600_000)).ymd;
}

/** Marks a task done or re-opens it. */
export async function setTaskDone(id: string, done: boolean): Promise<ActionResult<null>> {
  if (!uuid.safeParse(id).success) return fail("המשימה לא תקינה.");
  const { supabase, org } = await requireOrg();
  const { data, error } = await supabase
    .from("tasks")
    .update({ status: done ? "done" : "open" })
    .eq("id", id)
    .eq("organization_id", org.id)
    .select("id");
  if (error) return fail(friendlyError(error));
  if (!data?.length) return fail("לא מצאנו את המשימה. ייתכן שכבר נמחקה.");
  refresh();
  return ok(null);
}

/** Moves a task's due date to tomorrow (Israel time). Returns the new date. */
export async function postponeTaskToTomorrow(id: string): Promise<ActionResult<{ due_date: string }>> {
  if (!uuid.safeParse(id).success) return fail("המשימה לא תקינה.");
  const { supabase, org } = await requireOrg();
  const due = israelTomorrow();
  const { data, error } = await supabase
    .from("tasks")
    .update({ due_date: due })
    .eq("id", id)
    .eq("organization_id", org.id)
    .select("id");
  if (error) return fail(friendlyError(error));
  if (!data?.length) return fail("לא מצאנו את המשימה. ייתכן שכבר נמחקה.");
  refresh();
  return ok({ due_date: due });
}

/** Deletes a task (any team member may delete tasks — see RLS "members delete tasks"). */
export async function deleteTask(id: string): Promise<ActionResult<null>> {
  if (!uuid.safeParse(id).success) return fail("המשימה לא תקינה.");
  const { supabase, org, role } = await requireOrg();
  if (!role) return fail("אין לך הרשאה למחוק משימות בחשבון הזה.");
  const { data, error } = await supabase.from("tasks").delete().eq("id", id).eq("organization_id", org.id).select("id");
  if (error) return fail(friendlyError(error));
  if (!data?.length) return fail("לא הצלחנו למחוק את המשימה. ייתכן שכבר נמחקה.");
  refresh();
  return ok(null);
}

/** Marks a lead as contacted (status "new" → "contacted"). */
export async function markLeadContacted(id: string): Promise<ActionResult<null>> {
  if (!uuid.safeParse(id).success) return fail("הפנייה לא תקינה.");
  const { supabase, org } = await requireOrg();
  const { data, error } = await supabase
    .from("leads")
    .update({ status: "contacted" })
    .eq("id", id)
    .eq("organization_id", org.id)
    .in("status", ["new", "contacted"])
    .select("id");
  if (error) return fail(friendlyError(error));
  if (!data?.length) return fail("לא מצאנו את הפנייה, או שכבר טופלה.");
  revalidatePath("/leads");
  refresh();
  return ok(null);
}

// Attendance is stored on the appointment itself, as a marker on the first line of
// its notes ("[הגיע]" / "[לא הגיע]"). The today loader parses the same marker.
const ATTENDANCE_MARK = /^\[(הגיע|לא הגיע)\][ \t]*\n?/;
const ATTENDANCE_TEXT = { arrived: "[הגיע]", no_show: "[לא הגיע]" } as const;
const APPOINTMENT_TYPES = ["appointment", "meeting", "visit"];

/** Records whether the customer arrived to a past appointment. */
export async function setAppointmentAttendance(id: string, attendance: "arrived" | "no_show"): Promise<ActionResult<null>> {
  const parsed = z.object({ id: uuid, attendance: z.enum(["arrived", "no_show"]) }).safeParse({ id, attendance });
  if (!parsed.success) return fail("התור לא תקין.");
  const { supabase, org } = await requireOrg();
  const { data: row, error: readError } = await supabase
    .from("activities")
    .select("id, type, date, notes, customer_id")
    .eq("id", id)
    .eq("organization_id", org.id)
    .maybeSingle();
  if (readError) return fail(friendlyError(readError));
  if (!row || !APPOINTMENT_TYPES.includes(row.type)) return fail("לא מצאנו את התור.");
  if (new Date(row.date).getTime() > Date.now()) return fail("אפשר לסמן הגעה רק אחרי שהתור התחיל.");

  const rest = String(row.notes ?? "").replace(ATTENDANCE_MARK, "").trim();
  const notes = rest ? `${ATTENDANCE_TEXT[parsed.data.attendance]}\n${rest}` : ATTENDANCE_TEXT[parsed.data.attendance];
  const { data, error } = await supabase
    .from("activities")
    .update({ notes: notes.slice(0, 2000) })
    .eq("id", id)
    .eq("organization_id", org.id)
    .select("id");
  if (error) return fail(friendlyError(error));
  if (!data?.length) return fail("לא הצלחנו לעדכן את התור.");
  if (row.customer_id) revalidatePath(`/customers/${row.customer_id}`);
  revalidatePath("/activities");
  refresh();
  return ok(null);
}
