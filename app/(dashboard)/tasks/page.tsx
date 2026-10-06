import { ListChecks } from "@phosphor-icons/react/dist/ssr";
import { requireOrg } from "@/lib/supabase/server";
import { PageContainer, PageHeader } from "@/components/layout/page";
import { FilterTabs, Pagination } from "@/components/business/list-controls";
import { EmptyState } from "@/components/business/empty-state";
import { NewRecordButton } from "@/components/business/record-form";
import { TaskList } from "@/components/business/task-list";
import { Module, ModuleRail } from "@/components/ui/module";
import { israelToday } from "@/lib/analytics/dates";
import { pageParam, param, type SearchParams } from "@/lib/params";
import { formatNumber } from "@/lib/utils";
import type { Task } from "@/types/domain";

export const metadata = { title: "משימות" };
const PAGE_SIZE = 50;

export default async function TasksPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const { supabase, org, user } = await requireOrg();
  const page = pageParam(params);
  const view = param(params, "view") ?? "";

  let query = supabase.from("tasks").select("*, customers(name), deals(name)", { count: "exact" }).eq("organization_id", org.id);
  if (view === "" || view === "mine" || view === "overdue") query = query.eq("status", "open");
  if (view === "mine") query = query.eq("assigned_to", user.id);
  if (view === "overdue") query = query.lt("due_date", israelToday());
  if (view === "done") query = query.eq("status", "done");
  const { data, count } = await query
    .order("due_date", { ascending: view !== "done", nullsFirst: false })
    .order("created_at", { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  const tasks = (data ?? []) as Task[];

  return (
    <PageContainer className="max-w-3xl">
      <PageHeader title="משימות" description="למי לחזור ומה צריך לעשות — שלך ושל הצוות." actions={<NewRecordButton entity="tasks" />} />
      <Module>
        <ModuleRail
          icon={<ListChecks />}
          title="משימות"
          meta={<span className="num">{formatNumber(count ?? 0)}</span>}
          actions={
            <FilterTabs
              param="view"
              options={[
                { value: "", label: "פתוחות" },
                { value: "mine", label: "שלי" },
                { value: "overdue", label: "באיחור" },
                { value: "done", label: "בוצעו" },
              ]}
            />
          }
        />
        {tasks.length ? (
          <div className="px-4">
            <TaskList tasks={tasks} />
          </div>
        ) : (
          <EmptyState
            icon={ListChecks}
            title={view === "done" ? "עוד לא סיימת משימות" : "אין משימות פתוחות"}
            description="כאן יופיעו משימות שתוסיף, או שתאשר מההצעות של היועץ החכם."
            action={view === "done" ? undefined : <NewRecordButton entity="tasks" variant="outline" />}
          />
        )}
        <Pagination page={page} pageSize={PAGE_SIZE} total={count ?? 0} />
      </Module>
    </PageContainer>
  );
}
