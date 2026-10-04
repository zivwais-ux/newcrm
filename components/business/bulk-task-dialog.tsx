"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckCircle2, Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useWorkspace } from "@/components/layout/workspace-provider";
import { createFollowupTasks } from "@/lib/actions/records";
import { isoDate } from "@/lib/utils";

/**
 * Confirmation step before creating tasks in bulk. Nothing is written until the
 * user presses "Create tasks" — this is the human-in-the-loop gate for AI suggestions.
 */
export function BulkTaskDialog({
  open,
  onOpenChange,
  customerIds = [],
  dealIds = [],
  defaultTitle = "Follow up",
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
  const noun = dealIds.length && !customerIds.length ? "deal" : "customer";

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
            <CheckCircle2 className="size-8 text-positive" />
            <DialogTitle className="mt-3">
              {created} follow-up task{created === 1 ? "" : "s"} created
            </DialogTitle>
            <DialogDescription className="mt-1">They&apos;re assigned and visible on each customer&apos;s profile and in Tasks.</DialogDescription>
            <div className="mt-6 flex gap-2">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Close
              </Button>
              <Button
                onClick={() => {
                  onOpenChange(false);
                  router.push("/tasks");
                }}
              >
                View tasks
              </Button>
            </div>
          </div>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Create follow-up tasks</DialogTitle>
              <DialogDescription>
                This will create <span className="font-medium text-foreground">{count}</span> task{count === 1 ? "" : "s"} — one for each selected {noun}. Please confirm.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="bt-title">Task title</Label>
                <Input id="bt-title" value={title} onChange={(e) => setTitle(e.target.value)} />
                <p className="text-xs text-muted-foreground">Each task gets the {noun} name appended.</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="bt-due">Due date</Label>
                  <Input id="bt-due" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Assign to</Label>
                  <Select value={assignee} onValueChange={setAssignee}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {members.map((m) => (
                        <SelectItem key={m.user_id} value={m.user_id}>
                          {m.full_name ?? "Teammate"}
                          {m.user_id === user.id ? " (you)" : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button onClick={confirm} disabled={pending || !count || !title.trim()}>
                {pending && <Loader2 className="animate-spin" />}
                Create {count} task{count === 1 ? "" : "s"}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
