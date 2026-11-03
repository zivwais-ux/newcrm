import { cn } from "@/lib/utils";

/** Composed empty state: what appears here (icon tile, title, one line) and one clear action. */
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
    <div className={cn("flex flex-col items-center justify-center text-center", compact ? "gap-2.5 py-6" : "gap-3.5 py-14", className)}>
      {icon && (
        <span
          className={cn(
            "grid place-items-center border border-brand/10 bg-brand-soft text-brand shadow-[0_6px_16px_-8px_rgb(79_70_229/0.35)]",
            compact ? "size-10 rounded-[12px] [&_svg]:size-[18px]" : "size-12 rounded-[14px] [&_svg]:size-5",
          )}
        >
          {icon}
        </span>
      )}
      <div className="max-w-sm space-y-1">
        <p className={cn("font-semibold tracking-tight", compact ? "text-sm" : "text-[15px]")}>{title}</p>
        {description && <p className="text-[13px] leading-relaxed text-muted-foreground">{description}</p>}
      </div>
      {action && <div className="mt-1 flex flex-wrap items-center justify-center gap-2">{action}</div>}
    </div>
  );
}
