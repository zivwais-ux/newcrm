"use client";

import { useEffect } from "react";
import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function DashboardError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 text-center">
      <AlertCircle className="size-6 text-muted-foreground" />
      <h1 className="mt-4 text-base font-semibold">Something went wrong on this page</h1>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">Your data is safe. Try again, and if it keeps happening, refresh the page.</p>
      <Button className="mt-6" size="sm" onClick={reset}>
        Try again
      </Button>
    </div>
  );
}
