"use client";

import Link from "next/link";
import { ListChecks } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { formatNumber } from "@/lib/utils";
import { TaskList } from "@/components/business/task-list";
import { NewRecordButton } from "@/components/business/record-form";
import type { TasksData } from "@/lib/components/loaders";
import type { ViewProps } from "../shared";

export function TasksView({ data }: ViewProps<TasksData>) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          <span className="font-medium text-foreground tabular">{formatNumber(data.openCount)}</span> פתוחות
          {data.overdueCount > 0 && <span className="font-medium text-negative"> · {formatNumber(data.overdueCount)} באיחור</span>}
        </p>
        <NewRecordButton entity="tasks" variant="outline" size="xs">
          הוסף משימה
        </NewRecordButton>
      </div>
      {data.tasks.length ? (
        <>
          <TaskList tasks={data.tasks} />
          {data.openCount > data.tasks.length && (
            <Link href="/tasks" className="inline-block text-xs font-medium text-muted-foreground hover:text-foreground">
              לכל {formatNumber(data.openCount)} המשימות ←
            </Link>
          )}
        </>
      ) : (
        <EmptyState
          compact
          icon={<ListChecks />}
          title="אין משימות פתוחות"
          description="כאן יופיעו הדברים שצריך לעשות, מה שבאיחור קודם. משימה שתיצור מכל כלי או מכל לקוח תגיע לכאן."
          action={
            <NewRecordButton entity="tasks" size="sm">
              הוסף משימה
            </NewRecordButton>
          }
        />
      )}
    </div>
  );
}
