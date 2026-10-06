import * as React from "react";
import { cn } from "@/lib/utils";

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "flex h-9 w-full min-w-0 rounded-sm border border-input bg-module px-3 py-1 text-sm transition-[border-color,box-shadow] placeholder:text-muted-foreground/70 hover:border-border-strong focus-visible:border-brand focus-visible:ring-2 focus-visible:ring-brand/15 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/15",
        className,
      )}
      {...props}
    />
  );
}

export { Input };
