"use client";

import Link from "next/link";
import { ListChecks } from "lucide-react";
import { EmptyState } from "@/components/business/empty-state";
import { TaskList } from "@/components/business/task-list";
import { NewRecordButton } from "@/components/business/record-form";
import type { TasksData } from "@/lib/components/loaders";
import type { ViewProps } from "../shared";

export function TasksView({ data }: ViewProps<TasksData>) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          <span className="font-medium text-foreground tabular">{data.openCount}</span> open
          {data.overdueCount > 0 && <span className="font-medium text-negative"> · {data.overdueCount} overdue</span>}
        </p>
        <NewRecordButton entity="tasks" variant="outline" size="xs">
          Add task
        </NewRecordButton>
      </div>
      {data.tasks.length ? (
        <>
          <TaskList tasks={data.tasks} />
          {data.openCount > data.tasks.length && (
            <Link href="/tasks" className="inline-block text-xs font-medium text-muted-foreground hover:text-foreground">
              View all {data.openCount} tasks →
            </Link>
          )}
        </>
      ) : (
        <EmptyState compact icon={ListChecks} title="No open tasks" description="Create tasks from Customer Risk, Deal Risk or any customer — they land here." />
      )}
    </div>
  );
}
