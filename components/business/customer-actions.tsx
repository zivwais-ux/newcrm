"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CalendarPlus, Handshake, ListPlus, MoreHorizontal, Pencil, Receipt, Trash2 } from "lucide-react";
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
import { useCanManage } from "@/components/layout/workspace-provider";
import { deleteRecord, type RecordEntity } from "@/lib/actions/records";
import type { Customer } from "@/types/domain";

export function CustomerActions({ customer }: { customer: Customer }) {
  const router = useRouter();
  const canManage = useCanManage();
  const [dialog, setDialog] = useState<RecordEntity | "edit" | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [pending, startTransition] = useTransition();
  const labels = { customer_id: customer.name };

  return (
    <div className="flex flex-wrap gap-2">
      <Button size="sm" variant="outline" onClick={() => setDialog("activities")}>
        <CalendarPlus />
        רשום פעילות
      </Button>
      <Button size="sm" onClick={() => setDialog("tasks")}>
        <ListPlus />
        צור משימה
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="icon-sm" variant="outline" aria-label="עוד פעולות">
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => setDialog("edit")}>
            <Pencil />
            ערוך לקוח
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setDialog("transactions")}>
            <Receipt />
            הוסף מכירה
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setDialog("deals")}>
            <Handshake />
            הוסף עסקה
          </DropdownMenuItem>
          {canManage && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onSelect={() => setConfirmDelete(true)}>
                <Trash2 />
                מחק לקוח
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {dialog === "edit" && (
        <RecordFormDialog
          entity="customers"
          open
          onOpenChange={(o) => !o && setDialog(null)}
          recordId={customer.id}
          initial={{ name: customer.name, email: customer.email, phone: customer.phone, company: customer.company, status: customer.status }}
        />
      )}
      {dialog && dialog !== "edit" && (
        <RecordFormDialog
          entity={dialog}
          open
          onOpenChange={(o) => !o && setDialog(null)}
          initial={{ customer_id: customer.id, ...(dialog === "tasks" ? { title: `לחזור ל${customer.name}` } : {}) }}
          labels={labels}
        />
      )}
      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>למחוק את {customer.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              הלקוח יימחק לצמיתות. המכירות והפעילות שלו יישמרו, אבל כבר לא יהיו מקושרות ללקוח.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>ביטול</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  const res = await deleteRecord("customers", customer.id);
                  if (!res.ok) return void toast.error(res.error);
                  toast.success("הלקוח נמחק");
                  router.push("/customers");
                })
              }
            >
              מחק
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
