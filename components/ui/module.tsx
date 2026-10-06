import { cn } from "@/lib/utils";

/**
 * The one surface of the app: a block sitting on the table.
 * Square (2px), hairline border, a crisp offset edge instead of a soft card shadow.
 */
export function Module({ className, ...props }: React.ComponentProps<"section">) {
  return <section className={cn("relative border border-border bg-module shadow-block", className)} {...props} />;
}

/**
 * The module's top rail: optional index (01, 02…), icon, title, live status and actions.
 * Same rail on canvas tools, page bodies and settings cards, so the whole app speaks one language.
 */
export function ModuleRail({
  index,
  icon,
  title,
  meta,
  actions,
  className,
  children,
}: {
  index?: number | string;
  icon?: React.ReactNode;
  title?: React.ReactNode;
  /** Small text after the title (count, status). */
  meta?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className={cn("flex min-h-11 items-center gap-2.5 border-b border-border bg-rail px-3.5", className)}>
      {index !== undefined && (
        <span className="num w-5 shrink-0 text-[11px] font-medium text-muted-foreground" aria-hidden>
          {typeof index === "number" ? String(index).padStart(2, "0") : index}
        </span>
      )}
      {icon && <span className="grid size-5 shrink-0 place-items-center text-brand [&_svg]:size-[18px]">{icon}</span>}
      {children}
      {title && <h2 className="min-w-0 truncate text-[14px] font-semibold tracking-tight">{title}</h2>}
      {meta && <span className="shrink-0 text-xs text-muted-foreground">{meta}</span>}
      {actions && <div className="ms-auto flex shrink-0 items-center gap-1">{actions}</div>}
    </div>
  );
}

export function ModuleBody({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("p-4 sm:p-5", className)} {...props} />;
}

/** Live/filtered status dot used in rails. */
export function LiveDot({ state = "live", label }: { state?: "live" | "filtered" | "idle"; label?: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
      <span
        className={cn(
          "size-1.5 rounded-full",
          state === "live" && "bg-positive",
          state === "filtered" && "bg-brand",
          state === "idle" && "bg-border-strong",
        )}
      />
      {label}
    </span>
  );
}

/**
 * Wrap a child that still draws its own frame (border, radius, shadow — e.g. a legacy table wrapper)
 * so it sits flush inside a module instead of reading as a card inside a card.
 */
export function ModuleFlush({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "[&>div.overflow-hidden.border]:rounded-none [&>div.overflow-hidden.border]:border-0 [&>div.overflow-hidden.border]:shadow-none [&>div>div.overflow-hidden.border]:rounded-none [&>div>div.overflow-hidden.border]:border-0 [&>div>div.overflow-hidden.border]:shadow-none",
        className,
      )}
      {...props}
    />
  );
}

/** Bottom strip of a module: pagination, totals, a footnote. */
export function ModuleFooter({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("border-t border-border bg-rail px-3.5 py-2 text-xs text-muted-foreground", className)} {...props} />;
}
