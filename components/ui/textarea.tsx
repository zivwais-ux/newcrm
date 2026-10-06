import * as React from "react";
import { cn } from "@/lib/utils";

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "flex min-h-20 w-full rounded-sm border border-input bg-module px-3 py-2 text-sm transition-[border-color,box-shadow] placeholder:text-muted-foreground/70 hover:border-border-strong focus-visible:border-brand focus-visible:ring-2 focus-visible:ring-brand/15 focus-visible:outline-none disabled:opacity-50 aria-invalid:border-destructive",
        className,
      )}
      {...props}
    />
  );
}

export { Textarea };
