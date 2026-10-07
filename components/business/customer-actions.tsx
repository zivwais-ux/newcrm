"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CalendarPlus, DotsThree, Handshake, ListPlus, NotePencil, PencilSimple, Receipt, Trash } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { WhatsAppButton } from "./whatsapp-button";
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
import { QuickAppointmentDialog, QuickSaleDialog } from "./quick-entry";
import { useCanManage, useTerms } from "@/components/layout/workspace-provider";
import { deleteRecord, type RecordEntity } from "@/lib/actions/records";
import type { Customer } from "@/types/domain";

export function CustomerActions({ customer }: { customer: Customer }) {
  const router = useRouter();
  const canManage = useCanManage();
  const t = useTerms();
  const [dialog, setDialog] = useState<RecordEntity | "edit" | "sale" | "appointment" | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [pending, startTransition] = useTransition();
  const labels = { customer_id: customer.name };

  return (
    <div className="flex flex-wrap gap-2">
      <WhatsAppButton phone={customer.phone} name={customer.name} customerId={customer.id} variant="button" />
      <Button size="sm" variant="outline" onClick={() => setDialog("sale")}>
        <Receipt />
        {t.sale}
      </Button>
      <Button size="sm" variant="outline" onClick={() => setDialog("appointment")}>
        <CalendarPlus />
        {t.appointment}
      </Button>
      <Button size="sm" onClick={() => setDialog("tasks")}>
        <ListPlus />
        צור משימה
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="icon-sm" variant="outline" aria-label="עוד פעולות">
            <DotsThree />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => setDialog("edit")}>
            <PencilSimple />
            ערוך {t.customer}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setDialog("activities")}>
            <NotePencil />
            רשום שיחה או הערה
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setDialog("deals")}>
            <Handshake />
            הוסף {t.deal}
          </DropdownMenuItem>
          {canManage && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onSelect={() => setConfirmDelete(true)}>
                <Trash />
                מחק {t.customer}
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
          customFields={customer.custom_fields}
        />
      )}
      {dialog === "sale" && <QuickSaleDialog open onOpenChange={(o) => !o && setDialog(null)} customer={customer} />}
      {dialog === "appointment" && <QuickAppointmentDialog open onOpenChange={(o) => !o && setDialog(null)} customer={customer} />}
      {dialog && dialog !== "edit" && dialog !== "sale" && dialog !== "appointment" && (
        <RecordFormDialog
          entity={dialog}
          open
          onOpenChange={(o) => !o && setDialog(null)}
          initial={{ customer_id: customer.id, ...(dialog === "tasks" ? { title: `לחזור ל${customer.name}` } : dialog === "activities" ? { type: "call" } : {}) }}
          labels={labels}
        />
      )}
      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>למחוק את {customer.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              הכרטיס יימחק לצמיתות. ה{t.sales} והפעילות יישמרו, אבל בלי קישור לכרטיס.
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
                  toast.success("הכרטיס נמחק");
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
