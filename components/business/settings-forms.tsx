"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CircleNotch } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { updateOrganization, updateProfileName } from "@/lib/actions/org";
import type { BusinessType } from "@/types/domain";

export function WorkspaceSettingsForm({
  initial,
  canManage,
}: {
  initial: { name: string; businessType: BusinessType; currency: string };
  canManage: boolean;
}) {
  const router = useRouter();
  const [values, setValues] = useState(initial);
  const [pending, startTransition] = useTransition();
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        startTransition(async () => {
          const res = await updateOrganization({ name: values.name, businessType: values.businessType, currency: values.currency as "ILS" });
          if (!res.ok) return void toast.error(res.error);
          toast.success("פרטי העסק נשמרו");
          router.refresh();
        });
      }}
    >
      <div className="space-y-1.5">
        <Label htmlFor="ws-name">שם העסק</Label>
        <Input id="ws-name" dir="auto" value={values.name} disabled={!canManage} onChange={(e) => setValues({ ...values, name: e.target.value })} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>סוג העסק</Label>
          <Select value={values.businessType} disabled={!canManage} onValueChange={(v) => setValues({ ...values, businessType: v as BusinessType })}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="service">עסק נותן שירות</SelectItem>
              <SelectItem value="sales">עסק שמוכר</SelectItem>
              <SelectItem value="both">גם וגם</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">לפי זה נמליץ לך על הכלים המתאימים.</p>
        </div>
        <div className="space-y-1.5">
          <Label>מטבע</Label>
          <Select value={values.currency} disabled={!canManage} onValueChange={(v) => setValues({ ...values, currency: v })}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ILS">₪ שקל</SelectItem>
              <SelectItem value="USD">$ דולר אמריקאי</SelectItem>
              <SelectItem value="EUR">€ אירו</SelectItem>
              <SelectItem value="GBP">£ לירה שטרלינג</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      {canManage ? (
        <Button type="submit" size="sm" disabled={pending}>
          {pending && <CircleNotch className="animate-spin" />}
          שמור שינויים
        </Button>
      ) : (
        <p className="text-xs text-muted-foreground">רק בעלים ומנהלים יכולים לשנות את פרטי העסק.</p>
      )}
    </form>
  );
}

export function ProfileForm({ name }: { name: string }) {
  const router = useRouter();
  const [value, setValue] = useState(name);
  const [pending, startTransition] = useTransition();
  return (
    <form
      className="flex items-end gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        startTransition(async () => {
          const res = await updateProfileName(value);
          if (!res.ok) return void toast.error(res.error);
          toast.success("הפרופיל נשמר");
          router.refresh();
        });
      }}
    >
      <div className="flex-1 space-y-1.5">
        <Label htmlFor="p-name">השם שלך</Label>
        <Input id="p-name" dir="auto" value={value} onChange={(e) => setValue(e.target.value)} />
      </div>
      <Button type="submit" size="default" variant="outline" disabled={pending}>
        {pending && <CircleNotch className="animate-spin" />}
        שמור
      </Button>
    </form>
  );
}
