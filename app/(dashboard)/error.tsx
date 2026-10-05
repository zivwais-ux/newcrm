"use client";

import { useEffect } from "react";
import { AlertCircle, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

export default function DashboardError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4">
      <EmptyState
        icon={<AlertCircle />}
        title="משהו השתבש בעמוד הזה"
        description="הנתונים שלך שמורים. נסה שוב, ואם זה ממשיך לקרות — רענן את העמוד."
        action={
          <Button size="sm" onClick={reset}>
            <RotateCcw />
            נסה שוב
          </Button>
        }
      />
    </div>
  );
}
