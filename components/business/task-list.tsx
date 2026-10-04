"use client";

import { useOptimistic, useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Checkbox } from "@/components/ui/checkbox";
import { setTaskStatus } from "@/lib/actions/records";
import { useWorkspace } from "@/components/layout/workspace-provider";
import { cn, formatDate, isoDate } from "@/lib/utils";
import type { Task } from "@/types/domain";

export function TaskList({ tasks, showCustomer = true }: { tasks: Task[]; showCustomer?: boolean }) {
  const { members } = useWorkspace();
  const [, startTransition] = useTransition();
  const [optimistic, setOptimistic] = useOptimistic(tasks, (state, update: { id: string; status: "open" | "done" }) =>
    state.map((t) => (t.id === update.id ? { ...t, status: update.status } : t)),
  );
  const today = isoDate(new Date());

  return (
    <div className="divide-y">
      {optimistic.map((t) => {
        const overdue = t.status === "open" && t.due_date && t.due_date < today;
        const assignee = members.find((m) => m.user_id === t.assigned_to)?.full_name;
        return (
          <div key={t.id} className="flex items-start gap-3 py-2.5">
            <Checkbox
              className="mt-0.5"
              checked={t.status === "done"}
              aria-label={`Mark ${t.title} as ${t.status === "done" ? "open" : "done"}`}
              onCheckedChange={(v) => {
                const status = v ? "done" : "open";
                startTransition(async () => {
                  setOptimistic({ id: t.id, status });
                  const res = await setTaskStatus(t.id, status);
                  if (!res.ok) toast.error(res.error);
                });
              }}
            />
            <div className="min-w-0 flex-1">
              <p className={cn("text-sm", t.status === "done" && "text-muted-foreground line-through")}>{t.title}</p>
              <p className="flex flex-wrap gap-x-2 text-xs text-muted-foreground">
                {t.due_date && <span className={cn(overdue && "font-medium text-negative")}>Due {formatDate(t.due_date)}</span>}
                {showCustomer && t.customers?.name && t.customer_id && (
                  <Link href={`/customers/${t.customer_id}`} className="hover:underline">
                    {t.customers.name}
                  </Link>
                )}
                {t.deals?.name && <span>{t.deals.name}</span>}
                {assignee && <span>· {assignee}</span>}
              </p>
              {t.description && <p className="mt-0.5 text-xs text-zinc-600">{t.description}</p>}
            </div>
          </div>
        );
      })}
    </div>
  );
}
