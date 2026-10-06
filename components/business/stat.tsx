import { ArrowDownRight, ArrowUpRight, Minus } from "@phosphor-icons/react/dist/ssr";
import { cn } from "@/lib/utils";

export function Delta({ value, suffix = "", invert = false, className }: { value: number | null; suffix?: string; invert?: boolean; className?: string }) {
  if (value === null || !Number.isFinite(value)) return <span className={cn("text-xs text-muted-foreground", className)}>—</span>;
  const rounded = Math.round(value * 10) / 10;
  const good = invert ? rounded < 0 : rounded > 0;
  const flat = rounded === 0;
  const Icon = flat ? Minus : rounded > 0 ? ArrowUpRight : ArrowDownRight;
  return (
    <span
      className={cn(
        "num inline-flex items-center gap-0.5 text-xs font-medium",
        flat ? "text-muted-foreground" : good ? "text-positive" : "text-negative",
        className,
      )}
    >
      <Icon className="size-3.5" weight="bold" />
      {Math.abs(rounded)}
      {suffix || "%"}
    </span>
  );
}

export function Stat({
  label,
  value,
  delta,
  hint,
  className,
}: {
  label: string;
  value: React.ReactNode;
  delta?: number | null;
  hint?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("min-w-0 space-y-1", className)}>
      <p className="num truncate text-[26px] leading-none font-medium tracking-tight">{value}</p>
      <p className="truncate text-xs text-muted-foreground">{label}</p>
      {(delta !== undefined || hint) && (
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          {delta !== undefined && <Delta value={delta} />}
          {hint && <span className="truncate">{hint}</span>}
        </div>
      )}
    </div>
  );
}
