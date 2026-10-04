import { CalendarClock } from "lucide-react";
import { requireOrg } from "@/lib/supabase/server";
import { PageContainer, PageHeader } from "@/components/layout/page";
import { FilterTabs, Pagination } from "@/components/business/list-controls";
import { EmptyState } from "@/components/business/empty-state";
import { NewRecordButton } from "@/components/business/record-form";
import { ActivityItem } from "@/components/business/activity-list";
import { pageParam, param, type SearchParams } from "@/lib/params";
import { ACTIVITY_TYPES, type Activity } from "@/types/domain";

export const metadata = { title: "Activities" };
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

  // Group chronologically by day.
  const groups = new Map<string, Activity[]>();
  for (const a of rows) {
    const day = new Date(a.date).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
    groups.set(day, [...(groups.get(day) ?? []), a]);
  }

  return (
    <PageContainer className="max-w-3xl">
      <PageHeader title="Activities" description="Appointments, calls, meetings and notes — in order." actions={<NewRecordButton entity="activities" />} />
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <FilterTabs
          param="when"
          options={[
            { value: "", label: "All" },
            { value: "upcoming", label: "Upcoming" },
            { value: "past", label: "Past" },
          ]}
        />
        <FilterTabs param="type" options={[{ value: "", label: "Any type" }, ...ACTIVITY_TYPES.map((t) => ({ value: t, label: t[0].toUpperCase() + t.slice(1) }))]} />
      </div>
      {!rows.length ? (
        <EmptyState icon={CalendarClock} title="No activities" description="Log your first appointment, call or visit." action={<NewRecordButton entity="activities" variant="outline" />} />
      ) : (
        <div className="space-y-6">
          {[...groups.entries()].map(([day, items]) => (
            <div key={day}>
              <p className="mb-1 text-xs font-medium text-muted-foreground">{day}</p>
              <div className="rounded-lg border bg-surface px-4">
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
