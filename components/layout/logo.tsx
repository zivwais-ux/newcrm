import { cn } from "@/lib/utils";

export function Logo({ className, withText = true }: { className?: string; withText?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <span className="grid size-6 place-items-center rounded-[5px] bg-primary text-primary-foreground">
        <svg viewBox="0 0 16 16" className="size-3.5" fill="none" aria-hidden>
          <rect x="2" y="2" width="5" height="5" rx="1" fill="currentColor" />
          <rect x="9" y="2" width="5" height="5" rx="1" fill="currentColor" opacity=".55" />
          <rect x="2" y="9" width="5" height="5" rx="1" fill="currentColor" opacity=".55" />
          <rect x="9" y="9" width="5" height="5" rx="1" fill="currentColor" />
        </svg>
      </span>
      {withText && <span className="text-[15px] font-semibold tracking-tight">Business OS</span>}
    </span>
  );
}
