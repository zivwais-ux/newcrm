"use client";

import * as React from "react";
import { Progress as ProgressPrimitive } from "radix-ui";
import { cn } from "@/lib/utils";

function Progress({ className, value, ...props }: React.ComponentProps<typeof ProgressPrimitive.Root>) {
  return (
    <ProgressPrimitive.Root className={cn("relative h-1.5 w-full overflow-hidden rounded-sm bg-border/60", className)} {...props}>
      <ProgressPrimitive.Indicator
        className="h-full rounded-sm bg-brand transition-[width] duration-500 ease-out"
        style={{ width: `${Math.max(0, Math.min(100, value || 0))}%` }}
      />
    </ProgressPrimitive.Root>
  );
}

export { Progress };
