"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Sheet, SheetBody, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { updateComponentConfig } from "@/lib/actions/components";
import { SIZE_LABELS, type ConfigField } from "@/lib/components/types";

/** Settings form generated from the Component's configFields; saved to components.config. */
export function ComponentConfigSheet({
  open,
  onOpenChange,
  instanceId,
  name,
  fields,
  config,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  instanceId: string;
  name: string;
  fields: ConfigField[];
  config: Record<string, string>;
}) {
  const router = useRouter();
  const [values, setValues] = useState(config);
  const [pending, startTransition] = useTransition();

  function save() {
    startTransition(async () => {
      const res = await updateComponentConfig(instanceId, values);
      if (!res.ok) return void toast.error(res.error);
      toast.success("ההגדרות נשמרו");
      onOpenChange(false);
      router.refresh();
    });
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>הגדרות הכלי: {name}</SheetTitle>
          <SheetDescription>השינויים יחולו על כל מי שעובד איתך במערכת.</SheetDescription>
        </SheetHeader>
        <SheetBody className="space-y-5">
          {fields.map((f) => (
            <div key={f.key} className="space-y-1.5">
              <Label>{f.label}</Label>
              <Select value={values[f.key] ?? f.default} onValueChange={(v) => setValues((s) => ({ ...s, [f.key]: v }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {f.options.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {f.description && <p className="text-xs text-muted-foreground">{f.description}</p>}
            </div>
          ))}
          <div className="space-y-1.5">
            <Label>גודל במסך הבית</Label>
            <Select value={values.size} onValueChange={(v) => setValues((s) => ({ ...s, size: v }))}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(SIZE_LABELS).map(([k, label]) => (
                  <SelectItem key={k} value={k}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </SheetBody>
        <SheetFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            ביטול
          </Button>
          <Button onClick={save} disabled={pending}>
            {pending && <Loader2 className="animate-spin" />}
            שמור
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
