"use client";

import { Switch as SwitchPrimitive } from "radix-ui";
import { cn } from "@/lib/utils";

/** On/off for a flow. Square like everything else on the table; brand when on. */
export function Switch({ className, ...props }: React.ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      className={cn(
        "peer relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-sm border border-border-strong bg-muted p-[2px] transition-colors duration-150",
        "data-[state=checked]:border-brand data-[state=checked]:bg-brand",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 focus-visible:ring-offset-1 focus-visible:ring-offset-background",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        className={cn(
          "pointer-events-none block size-3.5 rounded-[1px] bg-module shadow-xs transition-transform duration-150 motion-reduce:transition-none",
          // RTL: "off" sits at the start (right); "on" slides toward the end (left).
          "translate-x-0 rtl:data-[state=checked]:-translate-x-4 ltr:data-[state=checked]:translate-x-4",
        )}
      />
    </SwitchPrimitive.Root>
  );
}
