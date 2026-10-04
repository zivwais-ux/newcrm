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

export const metadata = { title: "Tasks" };
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
      <PageHeader title="Tasks" description="Follow-ups and to-dos for your team." actions={<NewRecordButton entity="tasks" />} />
      <div className="mb-4">
        <FilterTabs
          param="view"
          options={[
            { value: "", label: "Open" },
            { value: "mine", label: "Assigned to me" },
            { value: "overdue", label: "Overdue" },
            { value: "done", label: "Done" },
          ]}
        />
      </div>
      {tasks.length ? (
        <div className="rounded-lg border bg-surface px-4">
          <TaskList tasks={tasks} />
        </div>
      ) : (
        <EmptyState icon={ListChecks} title={view === "done" ? "No completed tasks yet" : "You're all caught up"} description="Tasks you create — or confirm from AI suggestions — appear here." />
      )}
      <Pagination page={page} pageSize={PAGE_SIZE} total={count ?? 0} />
    </PageContainer>
  );
}
