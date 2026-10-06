"use client";

import { useOptimistic, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, PhoneCall, Radar } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Ltr } from "@/components/ui/ltr";
import { LEAD_STATUS_LABELS, label } from "@/components/business/labels";
import { WhatsAppButton } from "@/components/business/whatsapp-button";
import { STAGE_NAMES } from "@/lib/components/filters";
import { BulkTaskDialog } from "@/components/business/bulk-task-dialog";
import { markLeadContacted, setTaskDone } from "@/lib/actions/tools";
import { formatCurrency, relativeDays, formatDate, formatNumber, plural } from "@/lib/utils";
import type { RadarData } from "@/lib/components/loaders";
import { CreateTaskButton, ListRow, SectionLabel, type ViewProps } from "../shared";

type Removal = { kind: "task" | "lead"; id: string };

export function FollowupRadarView({ data, currency }: ViewProps<RadarData>) {
  const router = useRouter();
  const [bulk, setBulk] = useState(false);
  const [, start] = useTransition();
  const [removed, remove] = useOptimistic<Removal[], Removal>([], (state, r) => [...state, r]);
  const gone = (kind: Removal["kind"], id: string) => removed.some((r) => r.kind === kind && r.id === id);
  const tasks = data.overdueTasks.filter((t) => !gone("task", t.id));
  const leads = data.leads.filter((l) => !gone("lead", l.id));
  const taskCount = Math.max(0, data.overdueTaskCount - (data.overdueTasks.length - tasks.length));
  const leadCount = Math.max(0, data.leadCount - (data.leads.length - leads.length));

  function act(r: Removal, run: () => Promise<{ ok: boolean; error?: string }>, success: string) {
    start(async () => {
      remove(r);
      const res = await run();
      if (!res.ok) toast.error(res.error ?? "משהו השתבש. נסה שוב.");
      else toast.success(success);
      router.refresh();
    });
  }

  const nothing = !taskCount && !data.quietDealCount && !leadCount;
  if (nothing)
    return (
      <EmptyState
        compact
        icon={<Radar />}
        title="אין למי לחזור כרגע"
        description="כאן יופיעו משימות באיחור, עסקאות שאף אחד לא נגע בהן ופניות שמחכות לתשובה. כרגע הכל מטופל."
      />
    );

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-3 gap-2 text-center">
        {[
          { label: "משימות באיחור", value: taskCount },
          { label: "עסקאות שקטות", value: data.quietDealCount },
          { label: "פניות שמחכות", value: leadCount },
        ].map((s) => (
          <div key={s.label} className="rounded-xl border bg-muted/30 px-2 py-3">
            <p className="text-xl font-semibold tabular">{formatNumber(s.value)}</p>
            <p className="text-[11px] text-muted-foreground">{s.label}</p>
          </div>
        ))}
      </div>

      {tasks.length > 0 && (
        <div>
          <SectionLabel className="mb-1">משימות באיחור</SectionLabel>
          {tasks.map((t) => (
            <ListRow key={t.id}>
              <button
                type="button"
                aria-label={`סמן "${t.title}" כבוצעה`}
                title="סמן כבוצעה"
                onClick={() => act({ kind: "task", id: t.id }, () => setTaskDone(t.id, true), "המשימה סומנה כבוצעה")}
                className="group grid size-5 shrink-0 place-items-center rounded-full border-2 border-zinc-300 transition-colors hover:border-positive hover:bg-positive-soft cursor-pointer"
              >
                <Check className="size-3 text-positive opacity-0 group-hover:opacity-100" />
              </button>
              <div className="min-w-0 flex-1">
                <p dir="auto" className="truncate text-start text-sm">
                  {t.title}
                </p>
                <p className="truncate text-xs text-negative">
                  תאריך יעד: {formatDate(t.due_date)}
                  {t.customers?.name && <span className="text-muted-foreground"> · {t.customers.name}</span>}
                </p>
              </div>
            </ListRow>
          ))}
          {taskCount > tasks.length && (
            <Button asChild size="xs" variant="ghost" className="mt-1">
              <Link href="/tasks">לכל {formatNumber(taskCount)} המשימות באיחור ←</Link>
            </Button>
          )}
        </div>
      )}

      {data.quietDeals.length > 0 && (
        <div>
          <div className="mb-1 flex items-center justify-between">
            <SectionLabel>
              עסקאות בלי פעילות {data.idleDays} ימים ומעלה{data.stage ? ` · ${STAGE_NAMES[data.stage]}` : ""}
            </SectionLabel>
            <Button size="xs" variant="ghost" onClick={() => setBulk(true)}>
              צור משימות ({formatNumber(data.quietDealCount)})
            </Button>
          </div>
          {data.quietDeals.map((d) => (
            <ListRow key={d.id}>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm">{d.name}</p>
                <p className="truncate text-xs text-muted-foreground">
                  <Ltr>{formatCurrency(d.value, currency)}</Ltr> · שקטה כבר {plural(d.days_idle, "יום", "ימים", "יום אחד")}
                  {d.customer_name && ` · ${d.customer_name}`}
                </p>
              </div>
              <CreateTaskButton dealId={d.id} customerId={d.customer_id} customerName={d.customer_name} title={`לחזור לגבי ${d.name}`} />
            </ListRow>
          ))}
        </div>
      )}

      {leads.length > 0 && (
        <div>
          <SectionLabel className="mb-1">פניות שמחכות לך</SectionLabel>
          {leads.map((l) => (
            <ListRow key={l.id}>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm">{l.name}</p>
                <p className="truncate text-xs text-muted-foreground">
                  <span>{label(LEAD_STATUS_LABELS, l.status)}</span> · {l.source ?? "מקור לא ידוע"} · טופלה לאחרונה {relativeDays(l.updated_at)}
                  {l.phone && (
                    <>
                      {" · "}
                      <a href={`tel:${l.phone}`} className="hover:text-foreground hover:underline">
                        <Ltr>{l.phone}</Ltr>
                      </a>
                    </>
                  )}
                </p>
              </div>
              {l.phone && <WhatsAppButton phone={l.phone} name={l.name} />}
              <Button
                size="xs"
                variant="ghost"
                onClick={() => act({ kind: "lead", id: l.id }, () => markLeadContacted(l.id), `${l.name} סומנה כ"נוצר קשר"`)}
              >
                <PhoneCall />
                סמן שנוצר קשר
              </Button>
            </ListRow>
          ))}
        </div>
      )}
      {bulk && <BulkTaskDialog open onOpenChange={setBulk} dealIds={data.quietDealIds} defaultTitle="לחזור לגבי העסקה" />}
    </div>
  );
}
