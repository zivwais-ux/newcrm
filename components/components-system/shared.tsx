"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ListPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { RecordFormDialog } from "@/components/business/record-form";
import { updateComponentConfig } from "@/lib/actions/components";
import { cn } from "@/lib/utils";

export interface ViewProps<T> {
  data: T;
  config: Record<string, string>;
  instanceId: string | null;
  currency: string;
}

/** Opens a prefilled task form — the user always confirms before anything is created. */
export function CreateTaskButton({
  customerId,
  customerName,
  dealId,
  title,
  size = "xs",
  variant = "ghost",
  label = "צור משימה",
}: {
  customerId?: string | null;
  customerName?: string | null;
  dealId?: string | null;
  title: string;
  size?: "xs" | "sm";
  variant?: "ghost" | "outline";
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size={size} variant={variant} onClick={() => setOpen(true)}>
        <ListPlus />
        {label}
      </Button>
      {open && (
        <RecordFormDialog
          entity="tasks"
          open
          onOpenChange={setOpen}
          initial={{ title, customer_id: customerId ?? null, deal_id: dealId ?? null }}
          labels={{ customer_id: customerName ?? null }}
        />
      )}
    </>
  );
}

export function ViewLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Button asChild size="xs" variant="ghost">
      <Link href={href}>{children}</Link>
    </Button>
  );
}

/** Saves a config change for an installed Component, then refreshes server data. */
export function useConfigUpdater(instanceId: string | null) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const update = (patch: Record<string, string>) => {
    if (!instanceId) {
      const url = new URL(window.location.href);
      for (const [k, v] of Object.entries(patch)) url.searchParams.set(k, v);
      router.replace(url.pathname + url.search);
      return;
    }
    startTransition(async () => {
      const res = await updateComponentConfig(instanceId, patch);
      if (!res.ok) toast.error(res.error);
      router.refresh();
    });
  };
  return { update, pending };
}

export function SectionLabel({ children, className }: { children: React.ReactNode; className?: string }) {
  return <p className={cn("text-xs font-medium text-muted-foreground", className)}>{children}</p>;
}

export function ListRow({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("flex items-center gap-3 border-t py-2.5 first:border-t-0", className)}>{children}</div>;
}
