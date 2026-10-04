"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CalendarPlus, ListPlus, MoreHorizontal, Pencil, Receipt, Trash2 } from "lucide-react";
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
        Log activity
      </Button>
      <Button size="sm" onClick={() => setDialog("tasks")}>
        <ListPlus />
        Create task
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="icon-sm" variant="outline" aria-label="More actions">
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => setDialog("edit")}>
            <Pencil />
            Edit customer
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setDialog("transactions")}>
            <Receipt />
            Add transaction
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setDialog("deals")}>
            <ListPlus />
            Add deal
          </DropdownMenuItem>
          {canManage && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onSelect={() => setConfirmDelete(true)}>
                <Trash2 />
                Delete customer
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
          initial={{ customer_id: customer.id, ...(dialog === "tasks" ? { title: `Follow up with ${customer.name}` } : {}) }}
          labels={labels}
        />
      )}
      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {customer.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              The customer is permanently deleted. Their transactions and activities are kept but no longer linked to a customer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  const res = await deleteRecord("customers", customer.id);
                  if (!res.ok) return void toast.error(res.error);
                  toast.success("Customer deleted");
                  router.push("/customers");
                })
              }
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
