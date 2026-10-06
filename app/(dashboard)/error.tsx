"use client";

import { useEffect } from "react";
import { ArrowCounterClockwise, WarningCircle } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

export default function DashboardError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4">
      <EmptyState
        icon={<WarningCircle />}
        title="משהו השתבש בעמוד הזה"
        description="הנתונים שלך שמורים. נסה שוב, ואם זה ממשיך לקרות — רענן את העמוד."
        action={
          <Button size="sm" variant="outline" onClick={reset}>
            <ArrowCounterClockwise />
            נסה שוב
          </Button>
        }
      />
    </div>
  );
}
