import { CalendarDots } from "@phosphor-icons/react/dist/ssr";
import { requireOrg } from "@/lib/supabase/server";
import { PageContainer, PageHeader } from "@/components/layout/page";
import { FilterTabs, Pagination } from "@/components/business/list-controls";
import { EmptyState } from "@/components/business/empty-state";
import { NewRecordButton } from "@/components/business/record-form";
import { ActivityItem } from "@/components/business/activity-list";
import { Module, ModuleRail } from "@/components/ui/module";
import { pageParam, param, type SearchParams } from "@/lib/params";
import { ACTIVITY_TYPES, type Activity } from "@/types/domain";
import { activityLabel } from "@/components/business/labels";
import { resolveTerms } from "@/lib/terms";
import { formatDate, formatNumber, isoDate } from "@/lib/utils";

export const metadata = { title: "יומן פעילות" };
const WEEKDAYS = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];
const PAGE_SIZE = 40;

export default async function ActivitiesPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const { supabase, org } = await requireOrg();
  const terms = resolveTerms(org.terms);
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
      <PageHeader title="יומן פעילות" description={`${terms.appointments}, שיחות והערות — לפי הסדר.`} actions={<NewRecordButton entity="activities" />} />
      <Module>
        <ModuleRail icon={<CalendarDots />} title="יומן פעילות" meta={<span className="num">{formatNumber(count ?? 0)}</span>} />
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-3.5 py-2.5">
          <FilterTabs
            param="when"
            options={[
              { value: "", label: "הכל" },
              { value: "upcoming", label: "מה שמתוכנן" },
              { value: "past", label: "מה שהיה" },
            ]}
          />
          <FilterTabs param="type" options={[{ value: "", label: "כל הסוגים" }, ...ACTIVITY_TYPES.map((t) => ({ value: t, label: activityLabel(t, terms) }))]} />
        </div>
        {!rows.length ? (
          <EmptyState
            icon={CalendarDots}
            title="אין עדיין פעילות"
            description={`כאן יופיעו ה${terms.appointments}, השיחות וההערות שלך לפי ימים. רשום את הפעילות הראשונה.`}
            action={<NewRecordButton entity="activities" variant="outline" />}
          />
        ) : (
          <div>
            {[...groups.entries()].map(([key, { label: day, items }]) => (
              <section key={key} className="border-b border-border last:border-b-0">
                <h3 className="sticky top-0 z-[1] border-b border-border/60 bg-rail/95 px-4 py-1.5 text-xs font-semibold text-muted-foreground backdrop-blur-sm">{day}</h3>
                <div className="px-4">
                  {items.map((a) => (
                    <ActivityItem key={a.id} activity={a} />
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
        <Pagination page={page} pageSize={PAGE_SIZE} total={count ?? 0} />
      </Module>
    </PageContainer>
  );
}
