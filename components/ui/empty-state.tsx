import { cn } from "@/lib/utils";

/** Teaching empty state: icon, one sentence on what appears here, one clear action. */
export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
  compact = false,
}: {
  icon?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
  compact?: boolean;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center text-center", compact ? "gap-2 py-6" : "gap-3 py-12", className)}>
      {icon && (
        <span
          className={cn(
            "grid place-items-center rounded-2xl bg-gradient-to-b from-brand-soft to-brand-soft/40 text-brand ring-1 ring-brand/10 [&_svg]:size-5",
            compact ? "size-10" : "size-12",
          )}
        >
          {icon}
        </span>
      )}
      <div className="max-w-sm space-y-1">
        <p className={cn("font-semibold", compact ? "text-sm" : "text-[15px]")}>{title}</p>
        {description && <p className="text-[13px] leading-relaxed text-muted-foreground">{description}</p>}
      </div>
      {action && <div className="mt-1 flex flex-wrap items-center justify-center gap-2">{action}</div>}
    </div>
  );
}
