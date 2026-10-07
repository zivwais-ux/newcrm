"use client";

import { useOptimistic, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CalendarDots, DotsThree, PencilSimple, Trash } from "@phosphor-icons/react";
import { israelToday } from "@/lib/analytics/dates";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { RecordFormDialog } from "./record-form";
import { deleteTask, postponeTaskToTomorrow, setTaskDone } from "@/lib/actions/tools";
import { useWorkspace } from "@/components/layout/workspace-provider";
import { CustomerLink } from "@/components/components-system/workspace-filters";
import { cn, formatDate } from "@/lib/utils";
import type { Task } from "@/types/domain";

type Change =
  | { kind: "status"; id: string; status: "open" | "done" }
  | { kind: "due"; id: string; due_date: string }
  | { kind: "delete"; id: string };

/** Israel tomorrow, "yyyy-mm-dd" (for the optimistic due date; the server computes its own). */
function tomorrowYmd() {
  const [y, m, d] = israelToday().split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + 1));
  return t.toISOString().slice(0, 10);
}

export function TaskList({ tasks, showCustomer = true, actions = true }: { tasks: Task[]; showCustomer?: boolean; actions?: boolean }) {
  const router = useRouter();
  const { members } = useWorkspace();
  const [, startTransition] = useTransition();
  const [editing, setEditing] = useState<Task | null>(null);
  const [deleting, setDeleting] = useState<Task | null>(null);
  const [optimistic, apply] = useOptimistic(tasks, (state, c: Change) => {
    if (c.kind === "delete") return state.filter((t) => t.id !== c.id);
    return state.map((t) => (t.id !== c.id ? t : c.kind === "status" ? { ...t, status: c.status } : { ...t, due_date: c.due_date }));
  });
  const today = israelToday();

  function run(change: Change, action: () => Promise<{ ok: boolean; error?: string }>, success?: string) {
    startTransition(async () => {
      apply(change);
      const res = await action();
      if (!res.ok) toast.error(res.error ?? "משהו השתבש. נסה שוב.");
      else if (success) toast.success(success);
      router.refresh();
    });
  }

  return (
    <>
      <div className="divide-y">
        {optimistic.map((t) => {
          const overdue = t.status === "open" && t.due_date && t.due_date < today;
          const assignee = members.find((m) => m.user_id === t.assigned_to)?.full_name;
          return (
            <div key={t.id} className="group/task flex items-start gap-3 py-3">
              <Checkbox
                className="mt-0.5"
                checked={t.status === "done"}
                aria-label={t.status === "done" ? `סמן את "${t.title}" כפתוחה` : `סמן את "${t.title}" כבוצעה`}
                onCheckedChange={(v) => {
                  const status = v ? "done" : "open";
                  run({ kind: "status", id: t.id, status }, () => setTaskDone(t.id, status === "done"));
                }}
              />
              <div className="min-w-0 flex-1">
                <p dir="auto" className={cn("text-start text-sm", t.status === "done" && "text-muted-foreground line-through")}>
                  {t.title}
                </p>
                <p className="flex flex-wrap gap-x-2 text-xs text-muted-foreground">
                  {t.due_date && (
                    <span className={cn(overdue && "font-medium text-negative")}>
                      {overdue ? "באיחור · " : "עד "}
                      {formatDate(t.due_date)}
                    </span>
                  )}
                  {showCustomer && t.customers?.name && t.customer_id && (
                    <CustomerLink id={t.customer_id} className="hover:underline cursor-pointer">
                      {t.customers.name}
                    </CustomerLink>
                  )}
                  {t.deals?.name && <span>{t.deals.name}</span>}
                  {assignee && <span>· {assignee}</span>}
                </p>
                {t.description && (
                  <p dir="auto" className="mt-0.5 text-start text-xs text-zinc-600">
                    {t.description}
                  </p>
                )}
              </div>
              {actions && (
                <DropdownMenu dir="rtl">
                  <DropdownMenuTrigger asChild>
                    <Button size="icon-sm" variant="ghost" className="-my-1 shrink-0 text-muted-foreground" aria-label={`פעולות למשימה "${t.title}"`}>
                      <DotsThree />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {t.status === "open" && (
                      <DropdownMenuItem
                        onSelect={() =>
                          run({ kind: "due", id: t.id, due_date: tomorrowYmd() }, () => postponeTaskToTomorrow(t.id), "המשימה נדחתה למחר")
                        }
                      >
                        <CalendarDots />
                        דחה למחר
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem onSelect={() => setEditing(t)}>
                      <PencilSimple />
                      ערוך
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem variant="destructive" onSelect={() => setDeleting(t)}>
                      <Trash />
                      מחק
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          );
        })}
      </div>

      {editing && (
        <RecordFormDialog
          key={editing.id}
          entity="tasks"
          open
          onOpenChange={(o) => !o && setEditing(null)}
          recordId={editing.id}
          initial={{
            title: editing.title,
            description: editing.description,
            customer_id: editing.customer_id,
            deal_id: editing.deal_id,
            assigned_to: editing.assigned_to,
            due_date: editing.due_date,
          }}
          customFields={editing.custom_fields}
          labels={{ customer_id: editing.customers?.name ?? null, deal_id: editing.deals?.name ?? null }}
        />
      )}

      <AlertDialog open={Boolean(deleting)} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>למחוק את המשימה?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleting ? `"${deleting.title}" תימחק לגמרי. אי אפשר לבטל את זה.` : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>ביטול</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                if (!deleting) return;
                const id = deleting.id;
                setDeleting(null);
                run({ kind: "delete", id }, () => deleteTask(id), "המשימה נמחקה");
              }}
            >
              מחק
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
