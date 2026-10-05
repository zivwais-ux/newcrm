import { CalendarClock } from "lucide-react";
import { requireOrg } from "@/lib/supabase/server";
import { PageContainer, PageHeader } from "@/components/layout/page";
import { FilterTabs, Pagination } from "@/components/business/list-controls";
import { EmptyState } from "@/components/business/empty-state";
import { NewRecordButton } from "@/components/business/record-form";
import { ActivityItem } from "@/components/business/activity-list";
import { pageParam, param, type SearchParams } from "@/lib/params";
import { ACTIVITY_TYPES, type Activity } from "@/types/domain";
import { ACTIVITY_TYPE_LABELS } from "@/components/business/labels";
import { formatDate, isoDate } from "@/lib/utils";

export const metadata = { title: "יומן פעילות" };
const WEEKDAYS = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];
const PAGE_SIZE = 40;

export default async function ActivitiesPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const { supabase, org } = await requireOrg();
  const page = pageParam(params);
  const when = param(params, "when") ?? "";
  const type = param(params, "type");
  const now = new Date().toISOString();

  let query = supabase.from("activities").select("*, customers(name)", { count: "exact" }).eq("organization_id", org.id);
  if (when === "upcoming") query = query.gte("date", now);
  if (when === "past") query = query.lt("date", now);
  if (type && (ACTIVITY_TYPES as readonly string[]).includes(type)) query = query.eq("type", type);
  const { data, count } = await query.order("date", { ascending: when === "upcoming" }).range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  const rows = (data ?? []) as Activity[];

  // Group chronologically by day, with friendly Hebrew headings.
  const today = new Date();
  const shift = (days: number) => isoDate(new Date(today.getFullYear(), today.getMonth(), today.getDate() + days));
  const named: Record<string, string> = { [shift(0)]: "היום", [shift(-1)]: "אתמול", [shift(1)]: "מחר" };
  const groups = new Map<string, { label: string; items: Activity[] }>();
  for (const a of rows) {
    const d = new Date(a.date);
    const key = isoDate(d);
    const label = named[key] ?? `יום ${WEEKDAYS[d.getDay()]}, ${formatDate(key)}`;
    const g = groups.get(key) ?? { label, items: [] };
    g.items.push(a);
    groups.set(key, g);
  }

  return (
    <PageContainer className="max-w-3xl">
      <PageHeader title="יומן פעילות" description="תורים, שיחות, פגישות והערות — לפי הסדר." actions={<NewRecordButton entity="activities" />} />
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <FilterTabs
          param="when"
          options={[
            { value: "", label: "הכל" },
            { value: "upcoming", label: "מה שמתוכנן" },
            { value: "past", label: "מה שהיה" },
          ]}
        />
        <FilterTabs param="type" options={[{ value: "", label: "כל הסוגים" }, ...ACTIVITY_TYPES.map((t) => ({ value: t, label: ACTIVITY_TYPE_LABELS[t] ?? t }))]} />
      </div>
      {!rows.length ? (
        <EmptyState
          icon={CalendarClock}
          title="אין עדיין פעילות"
          description="כאן יופיעו התורים, השיחות והפגישות שלך לפי ימים. רשום את הפעילות הראשונה."
          action={<NewRecordButton entity="activities" variant="outline" />}
        />
      ) : (
        <div className="space-y-6">
          {[...groups.entries()].map(([key, { label: day, items }]) => (
            <div key={key}>
              <p className="mb-2 px-1 text-[13px] font-semibold text-muted-foreground">{day}</p>
              <div className="rounded-xl border bg-surface px-4 shadow-sm">
                {items.map((a) => (
                  <ActivityItem key={a.id} activity={a} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
      <Pagination page={page} pageSize={PAGE_SIZE} total={count ?? 0} />
    </PageContainer>
  );
}
