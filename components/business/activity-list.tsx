"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CalendarClock, Mail, MapPin, MoreHorizontal, NotebookPen, Pencil, Phone, Trash2, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { RecordFormDialog } from "./record-form";
import { deleteRecord } from "@/lib/actions/records";
import type { Activity } from "@/types/domain";
import { cn } from "@/lib/utils";

const ICON = { appointment: CalendarClock, call: Phone, meeting: Users, email: Mail, note: NotebookPen, visit: MapPin } as const;

function when(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

export function ActivityItem({ activity, showCustomer = true }: { activity: Activity; showCustomer?: boolean }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [pending, startTransition] = useTransition();
  const Icon = ICON[activity.type] ?? NotebookPen;
  const future = new Date(activity.date) > new Date();

  return (
    <div className={cn("group flex items-start gap-3 border-t py-2.5 first:border-t-0", pending && "opacity-50")}>
      <span className={cn("mt-0.5 grid size-7 shrink-0 place-items-center rounded-md border", future ? "bg-brand-soft text-brand border-transparent" : "bg-surface text-muted-foreground")}>
        <Icon className="size-3.5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm">
          <span className="font-medium capitalize">{activity.type}</span>
          {showCustomer && activity.customers?.name && activity.customer_id && (
            <>
              {" · "}
              <Link href={`/customers/${activity.customer_id}`} className="hover:underline">
                {activity.customers.name}
              </Link>
            </>
          )}
        </p>
        <p className="text-xs text-muted-foreground">{when(activity.date)}</p>
        {activity.notes && <p className="mt-1 line-clamp-2 text-[13px] text-zinc-600">{activity.notes}</p>}
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="icon-sm" variant="ghost" className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100" aria-label="Activity actions">
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => setEditing(true)}>
            <Pencil />
            Edit
          </DropdownMenuItem>
          <DropdownMenuItem
            variant="destructive"
            onSelect={() =>
              startTransition(async () => {
                const res = await deleteRecord("activities", activity.id);
                if (!res.ok) toast.error(res.error);
                else toast.success("Activity deleted");
                router.refresh();
              })
            }
          >
            <Trash2 />
            Delete
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
