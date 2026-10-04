"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
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
          toast.success("Workspace updated");
          router.refresh();
        });
      }}
    >
      <div className="space-y-1.5">
        <Label htmlFor="ws-name">Business name</Label>
        <Input id="ws-name" value={values.name} disabled={!canManage} onChange={(e) => setValues({ ...values, name: e.target.value })} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Business type</Label>
          <Select value={values.businessType} disabled={!canManage} onValueChange={(v) => setValues({ ...values, businessType: v as BusinessType })}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="service">Service business</SelectItem>
              <SelectItem value="sales">Sales business</SelectItem>
              <SelectItem value="both">Both</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">Shapes Component recommendations.</p>
        </div>
        <div className="space-y-1.5">
          <Label>Currency</Label>
          <Select value={values.currency} disabled={!canManage} onValueChange={(v) => setValues({ ...values, currency: v })}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ILS">₪ Israeli shekel</SelectItem>
              <SelectItem value="USD">$ US dollar</SelectItem>
              <SelectItem value="EUR">€ Euro</SelectItem>
              <SelectItem value="GBP">£ British pound</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      {canManage ? (
        <Button type="submit" size="sm" disabled={pending}>
          {pending && <Loader2 className="animate-spin" />}
          Save changes
        </Button>
      ) : (
        <p className="text-xs text-muted-foreground">Only owners and admins can change workspace settings.</p>
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
          toast.success("Profile updated");
          router.refresh();
        });
      }}
    >
      <div className="flex-1 space-y-1.5">
        <Label htmlFor="p-name">Your name</Label>
        <Input id="p-name" value={value} onChange={(e) => setValue(e.target.value)} />
      </div>
      <Button type="submit" size="default" variant="outline" disabled={pending}>
        {pending && <Loader2 className="animate-spin" />}
        Save
      </Button>
    </form>
  );
}
