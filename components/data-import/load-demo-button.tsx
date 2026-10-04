"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { loadDemoData } from "@/lib/actions/demo";

export function LoadDemoButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <Button
      variant="outline"
      size="sm"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const res = await loadDemoData();
          if (!res.ok) return void toast.error(res.error);
          toast.success(`Loaded ${res.data.customers} customers and ${res.data.transactions} transactions`);
          router.push("/components?imported=1");
          router.refresh();
        })
      }
    >
      {pending && <Loader2 className="animate-spin" />}
      {pending ? "Loading sample data…" : "Load sample data"}
    </Button>
  );
}
