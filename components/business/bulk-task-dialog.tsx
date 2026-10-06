"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckCircle, CircleNotch } from "@phosphor-icons/react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useWorkspace } from "@/components/layout/workspace-provider";
import { createFollowupTasks } from "@/lib/actions/records";
import { formatNumber, isoDate, plural } from "@/lib/utils";

/**
 * Confirmation step before creating tasks in bulk. Nothing is written until the
 * user presses "Create tasks" — this is the human-in-the-loop gate for AI suggestions.
 */
export function BulkTaskDialog({
  open,
  onOpenChange,
  customerIds = [],
  dealIds = [],
  defaultTitle = "לחזור ללקוח",
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customerIds?: string[];
  dealIds?: string[];
  defaultTitle?: string;
  onCreated?: (count: number) => void;
}) {
  const router = useRouter();
  const { members, user } = useWorkspace();
  const [title, setTitle] = useState(defaultTitle);
  const [dueDate, setDueDate] = useState(isoDate(new Date(Date.now() + 2 * 86_400_000)));
  const [assignee, setAssignee] = useState(user.id);
  const [created, setCreated] = useState<number | null>(null);
  const [pending, startTransition] = useTransition();
  const count = customerIds.length + dealIds.length;
  const isDeals = Boolean(dealIds.length && !customerIds.length);
  const tasksLabel = (n: number) => plural(n, "משימה", "משימות", "משימה אחת");

  function confirm() {
    startTransition(async () => {
      const res = await createFollowupTasks({ customerIds, dealIds, title, dueDate, assignedTo: assignee });
      if (!res.ok) return void toast.error(res.error);
      setCreated(res.data.created);
      onCreated?.(res.data.created);
      router.refresh();
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) setCreated(null);
      }}
    >
      <DialogContent className="sm:max-w-md">
        {created !== null ? (
          <div className="flex flex-col items-center py-4 text-center">
            <CheckCircle className="size-8 text-positive" />
            <DialogTitle className="mt-3">{created === 1 ? "נוצרה משימת מעקב אחת" : `נוצרו ${formatNumber(created)} משימות מעקב`}</DialogTitle>
            <DialogDescription className="mt-1">הן כבר משויכות, ומופיעות בכרטיס של כל לקוח ובעמוד המשימות.</DialogDescription>
            <div className="mt-6 flex gap-2">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                סגור
              </Button>
              <Button
                onClick={() => {
                  onOpenChange(false);
                  router.push("/tasks");
                }}
              >
                למשימות
              </Button>
            </div>
          </div>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>יצירת משימות מעקב</DialogTitle>
              <DialogDescription>
                ייווצרו <span className="font-medium text-foreground">{tasksLabel(count)}</span> — אחת לכל {isDeals ? "עסקה" : "לקוח"} שבחרת. אשר כדי להמשיך.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="bt-title">מה צריך לעשות?</Label>
                <Input id="bt-title" dir="auto" value={title} onChange={(e) => setTitle(e.target.value)} />
                <p className="text-xs text-muted-foreground">לכל משימה יתווסף שם {isDeals ? "העסקה" : "הלקוח"}.</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="bt-due">תאריך יעד</Label>
                  <Input id="bt-due" type="date" dir="ltr" className="text-end" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>באחריות</Label>
                  <Select value={assignee} onValueChange={setAssignee}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {members.map((m) => (
                        <SelectItem key={m.user_id} value={m.user_id}>
                          {m.full_name ?? "חבר צוות"}
                          {m.user_id === user.id ? " (אני)" : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                ביטול
              </Button>
              <Button onClick={confirm} disabled={pending || !count || !title.trim()}>
                {pending && <CircleNotch className="animate-spin" />}
                צור {tasksLabel(count)}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
