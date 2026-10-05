"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CalendarClock, Mail, MapPin, MoreHorizontal, NotebookPen, Pencil, Phone, Trash2, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { RecordFormDialog } from "./record-form";
import { LocalDateTime } from "@/components/ui/local-time";
import { CustomerLink } from "@/components/components-system/workspace-filters";
import { deleteRecord } from "@/lib/actions/records";
import type { Activity } from "@/types/domain";
import { cn } from "@/lib/utils";
import { ACTIVITY_TYPE_LABELS } from "./labels";

const ICON = { appointment: CalendarClock, call: Phone, meeting: Users, email: Mail, note: NotebookPen, visit: MapPin } as const;

export function ActivityItem({ activity, showCustomer = true }: { activity: Activity; showCustomer?: boolean }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [pending, startTransition] = useTransition();
  const Icon = ICON[activity.type] ?? NotebookPen;
  const future = new Date(activity.date) > new Date();

  return (
    <div className={cn("group flex items-start gap-3 border-t py-3 first:border-t-0", pending && "opacity-50")}>
      <span className={cn("mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg border", future ? "bg-brand-soft text-brand border-transparent" : "bg-surface text-muted-foreground")}>
        <Icon className="size-3.5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm">
          <span className="font-medium">{ACTIVITY_TYPE_LABELS[activity.type] ?? activity.type}</span>
          {showCustomer && activity.customers?.name && activity.customer_id && (
            <>
              {" · "}
              <CustomerLink id={activity.customer_id} className="hover:underline cursor-pointer">
                {activity.customers.name}
              </CustomerLink>
            </>
          )}
        </p>
        <p className="text-xs text-muted-foreground">
          <LocalDateTime value={activity.date} />
        </p>
        {activity.notes && (
          <p dir="auto" className="mt-1 line-clamp-2 text-start text-[13px] text-zinc-600">
            {activity.notes}
          </p>
        )}
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="icon-sm" variant="ghost" className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100" aria-label="פעולות על הפעילות">
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => setEditing(true)}>
            <Pencil />
            ערוך
          </DropdownMenuItem>
          <DropdownMenuItem
            variant="destructive"
            onSelect={() =>
              startTransition(async () => {
                const res = await deleteRecord("activities", activity.id);
                if (!res.ok) toast.error(res.error);
                else toast.success("הפעילות נמחקה");
                router.refresh();
              })
            }
          >
            <Trash2 />
            מחק
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {editing && (
        <RecordFormDialog
          entity="activities"
          open
          onOpenChange={setEditing}
          recordId={activity.id}
          initial={{ type: activity.type, date: activity.date, customer_id: activity.customer_id, notes: activity.notes }}
          labels={{ customer_id: activity.customers?.name ?? null }}
        />
      )}
    </div>
  );
}
