import { ListChecks } from "lucide-react";
import { requireOrg } from "@/lib/supabase/server";
import { PageContainer, PageHeader } from "@/components/layout/page";
import { FilterTabs, Pagination } from "@/components/business/list-controls";
import { EmptyState } from "@/components/business/empty-state";
import { NewRecordButton } from "@/components/business/record-form";
import { TaskList } from "@/components/business/task-list";
import { isoDate } from "@/lib/utils";
import { pageParam, param, type SearchParams } from "@/lib/params";
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
  if (view === "overdue") query = query.lt("due_date", isoDate(new Date()));
  if (view === "done") query = query.eq("status", "done");
  const { data, count } = await query
    .order("due_date", { ascending: view !== "done", nullsFirst: false })
    .order("created_at", { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  const tasks = (data ?? []) as Task[];

  return (
    <PageContainer className="max-w-3xl">
      <PageHeader title="משימות" description="למי לחזור ומה צריך לעשות — שלך ושל הצוות." actions={<NewRecordButton entity="tasks" />} />
      <div className="mb-4">
        <FilterTabs
          param="view"
          options={[
            { value: "", label: "פתוחות" },
            { value: "mine", label: "שלי" },
            { value: "overdue", label: "באיחור" },
            { value: "done", label: "בוצעו" },
          ]}
        />
      </div>
      {tasks.length ? (
        <div className="rounded-xl border bg-surface px-4 shadow-sm">
          <TaskList tasks={tasks} />
        </div>
      ) : (
        <EmptyState
          icon={ListChecks}
          title={view === "done" ? "עוד לא סיימת משימות" : "אין משימות פתוחות — כל הכבוד!"}
          description="כאן יופיעו משימות שתוסיף, או שתאשר מההצעות של היועץ החכם."
          action={view === "done" ? undefined : <NewRecordButton entity="tasks" variant="outline" />}
        />
      )}
      <Pagination page={page} pageSize={PAGE_SIZE} total={count ?? 0} />
    </PageContainer>
  );
}
