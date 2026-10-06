"use client";

import { useOptimistic, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { BellRing, CalendarClock, Check, CheckCircle2, Handshake, ListChecks, Sun, UserRoundCheck, UserRoundX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Ltr } from "@/components/ui/ltr";
import { WhatsAppButton } from "@/components/business/whatsapp-button";
import { ACTIVITY_TYPE_LABELS, label } from "@/components/business/labels";
import { setAppointmentAttendance, setTaskDone } from "@/lib/actions/tools";
import { cn, formatCurrency, formatDate, formatNumber, plural } from "@/lib/utils";
import type { TodayData } from "@/lib/components/loaders";
import { CustomerLink } from "../workspace-filters";
import { CreateTaskButton, ListRow, SectionLabel, type ViewProps } from "../shared";

function time(iso: string) {
  const d = new Date(iso);
  return new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Jerusalem" }).format(d);
}

function Section({ icon, title, count, children }: { icon: React.ReactNode; title: string; count: number; children: React.ReactNode }) {
  return (
    <section>
      <div className="mb-1 flex items-center gap-2">
        <span className="grid size-6 place-items-center rounded-md bg-muted text-muted-foreground [&_svg]:size-3.5">{icon}</span>
        <SectionLabel>{title}</SectionLabel>
        <span className="rounded-sm bg-muted px-1.5 text-[11px] font-medium tabular text-muted-foreground">{formatNumber(count)}</span>
      </div>
      <div>{children}</div>
    </section>
  );
}

export function TodayView({ data, currency }: ViewProps<TodayData>) {
  const router = useRouter();
  const [, start] = useTransition();
  const [tasks, markDone] = useOptimistic(data.tasks, (state, id: string) => state.filter((t) => t.id !== id));
  const [appointments, markAttendance] = useOptimistic(data.appointments, (state, m: { id: string; attendance: "arrived" | "no_show" }) =>
    state.map((a) => (a.id === m.id ? { ...a, attendance: m.attendance } : a)),
  );
  // Counts follow optimistic updates immediately, before the server refresh lands.
  const taskCount = Math.max(0, data.taskCount - (data.tasks.length - tasks.length));
  const openAppointments = appointments.filter((a) => !a.attendance).length;
  const pendingReminders = data.reminders.filter((r) => !r.sent).length;
  const total = openAppointments + taskCount + data.comeBack.length + data.stuck.length + pendingReminders;

  function attendance(id: string, value: "arrived" | "no_show") {
    start(async () => {
      markAttendance({ id, attendance: value });
      const res = await setAppointmentAttendance(id, value);
      if (!res.ok) toast.error(res.error);
      else toast.success(value === "arrived" ? "נרשם שהלקוח הגיע" : "נרשם שהלקוח לא הגיע");
      router.refresh();
    });
  }

  if (!total && !appointments.length && !data.reminders.length)
    return (
      <EmptyState
        compact
        icon={<Sun />}
        title="אין שום דבר דחוף היום 🎉"
        description="כל בוקר יופיעו כאן התורים של היום, משימות שהגיע זמנן, לקוחות שכדאי להזכיר להם לחזור ועסקאות שנתקעו — עם כפתור WhatsApp לכל אחד."
      />
    );

  return (
    <div className="space-y-5">
      <p className="text-sm">
        <span className="font-semibold">{plural(total, "דבר", "דברים", "דבר אחד")}</span>
        <span className="text-muted-foreground"> מחכים לך היום · {formatDate(data.today)}</span>
        {data.scopedTo && <span className="text-muted-foreground"> · רק {data.scopedTo}</span>}
      </p>

      {appointments.length > 0 && (
        <Section icon={<CalendarClock />} title="תורים ופגישות היום" count={appointments.length}>
          {appointments.map((a) => (
            <ListRow key={a.id} className={cn(a.attendance && "opacity-70")}>
              <span className="w-12 shrink-0 text-sm font-semibold tabular">
                <Ltr>{time(a.date)}</Ltr>
              </span>
              <div className="min-w-0 flex-1">
                {a.customer_id && a.customer ? <CustomerLink id={a.customer_id}>{a.customer.name}</CustomerLink> : <p className="text-sm">{label(ACTIVITY_TYPE_LABELS, a.type)}</p>}
                <p className="truncate text-xs text-muted-foreground">
                  {a.attendance === "arrived" && <span className="font-medium text-positive">הגיע · </span>}
                  {a.attendance === "no_show" && <span className="font-medium text-negative">לא הגיע · </span>}
                  {a.notes || label(ACTIVITY_TYPE_LABELS, a.type)}
                </p>
              </div>
              {a.past && !a.attendance && (
                <div className="flex shrink-0 gap-0.5">
                  <Button size="xs" variant="ghost" className="text-positive" onClick={() => attendance(a.id, "arrived")}>
                    <CheckCircle2 />
                    הגיע
                  </Button>
                  <Button size="xs" variant="ghost" className="text-negative" onClick={() => attendance(a.id, "no_show")}>
                    <UserRoundX />
                    לא הגיע
                  </Button>
                </div>
              )}
              {a.customer && !a.past && <WhatsAppButton phone={a.customer.phone} name={a.customer.name} customerId={a.customer_id} template="תזכורת לתור" />}
              {a.customer && a.attendance === "no_show" && (
                <WhatsAppButton phone={a.customer.phone} name={a.customer.name} customerId={a.customer_id} template="הודעה חופשית" />
              )}
            </ListRow>
          ))}
        </Section>
      )}

      {tasks.length > 0 && (
        <Section icon={<ListChecks />} title="משימות להיום ובאיחור" count={taskCount}>
          {tasks.map((t) => {
            const late = t.due_date && t.due_date < data.today;
            return (
              <ListRow key={t.id}>
                <button
                  type="button"
                  aria-label={`סמן "${t.title}" כבוצעה`}
                  onClick={() =>
                    start(async () => {
                      markDone(t.id);
                      const res = await setTaskDone(t.id, true);
                      if (!res.ok) toast.error(res.error);
                      else toast.success("כל הכבוד! המשימה סומנה כבוצעה");
                      router.refresh();
                    })
                  }
                  className="group grid size-5 shrink-0 place-items-center rounded-full border-2 border-zinc-300 transition-colors hover:border-positive hover:bg-positive-soft cursor-pointer"
                >
                  <Check className="size-3 text-positive opacity-0 group-hover:opacity-100" />
                </button>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm">{t.title}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {late ? <span className="font-medium text-negative">באיחור · {formatDate(t.due_date)}</span> : "להיום"}
                    {t.customer && ` · ${t.customer.name}`}
                  </p>
                </div>
                {t.customer && <WhatsAppButton phone={t.customer.phone} name={t.customer.name} customerId={t.customer_id} />}
              </ListRow>
            );
          })}
        </Section>
      )}

      {data.comeBack.length > 0 && (
        <Section icon={<UserRoundCheck />} title="הגיע הזמן שיחזרו" count={data.comeBack.length}>
          {data.comeBack.map((c) => (
            <ListRow key={c.id}>
              <div className="min-w-0 flex-1">
                <CustomerLink id={c.id}>{c.name}</CustomerLink>
                <p className="truncate text-xs text-muted-foreground">
                  בדרך כלל חוזר כל {plural(Math.round(c.median_interval_days), "יום", "ימים")} · לא היה {plural(c.days_since, "יום", "ימים")}
                </p>
              </div>
              <WhatsAppButton phone={c.phone} name={c.name} customerId={c.id} template="לא ראינו אותך מזמן" variant="button" label="הזמן לחזור" />
              <CreateTaskButton customerId={c.id} customerName={c.name} title={`לחזור ל${c.name}`} label="משימה" />
            </ListRow>
          ))}
        </Section>
      )}

      {data.stuck.length > 0 && (
        <Section icon={<Handshake />} title="עסקאות שנתקעו" count={data.stuck.length}>
          {data.stuck.map((d) => (
            <ListRow key={d.id}>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm">{d.name}</p>
                <p className="truncate text-xs text-muted-foreground">
                  <Ltr>{formatCurrency(d.value, currency)}</Ltr> · בלי מגע {plural(d.days_idle, "יום", "ימים")}
                  {d.customer_name && ` · ${d.customer_name}`}
                </p>
              </div>
              {d.customer_name && <WhatsAppButton phone={d.phone} name={d.customer_name} customerId={d.customer_id} dealId={d.id} />}
            </ListRow>
          ))}
        </Section>
      )}

      {data.reminders.length > 0 && (
        <Section icon={<BellRing />} title="תזכורת לתורים של מחר" count={pendingReminders}>
          <p className="mb-1 text-xs text-muted-foreground">שלח לכל לקוח תזכורת ב-WhatsApp, כדי שלא ישכח את התור של {formatDate(data.tomorrow)}.</p>
          {data.reminders.map((r) => (
            <ListRow key={r.id}>
              <span className="w-12 shrink-0 text-sm font-semibold tabular">
                <Ltr>{time(r.date)}</Ltr>
              </span>
              <div className="min-w-0 flex-1">
                {r.customer_id && r.customer ? <CustomerLink id={r.customer_id}>{r.customer.name}</CustomerLink> : <p className="text-sm">{label(ACTIVITY_TYPE_LABELS, r.type)}</p>}
                <p className="truncate text-xs text-muted-foreground">
                  {r.sent && <span className="font-medium text-positive">נשלחה הודעה היום · </span>}
                  {r.notes || label(ACTIVITY_TYPE_LABELS, r.type)}
                </p>
              </div>
              {r.customer ? (
                <WhatsAppButton
                  phone={r.customer.phone}
                  name={r.customer.name}
                  customerId={r.customer_id}
                  template="תזכורת לתור"
                  variant="button"
                  label={r.sent ? "שלח שוב" : "שלח תזכורת"}
                />
              ) : (
                <span className="text-xs text-muted-foreground">אין לקוח מקושר</span>
              )}
            </ListRow>
          ))}
        </Section>
      )}
    </div>
  );
}
