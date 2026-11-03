import { Children, cloneElement, isValidElement } from "react";
import { ArrowDownRight, ArrowUpRight, Minus } from "@phosphor-icons/react/dist/ssr";
import { CountUp } from "@/components/ui/count-up";
import { cn } from "@/lib/utils";

/**
 * Makes a dashboard number count up: plain text, or one element (usually <Ltr>) whose only child is text.
 * Anything richer is left as it is.
 */
export function countUpNode(node: React.ReactNode): React.ReactNode {
  if (typeof node === "string" || typeof node === "number") return <CountUp text={String(node)} />;
  if (isValidElement<{ children?: React.ReactNode }>(node)) {
    const kids = Children.toArray(node.props.children);
    if (kids.length === 1 && (typeof kids[0] === "string" || typeof kids[0] === "number")) {
      return cloneElement(node, undefined, <CountUp text={String(kids[0])} />);
    }
  }
  return node;
}

/** Change chip: soft green/red background, arrow, and the size of the change. */
export function Delta({ value, suffix = "", invert = false, className }: { value: number | null; suffix?: string; invert?: boolean; className?: string }) {
  if (value === null || !Number.isFinite(value)) return <span className={cn("text-xs text-muted-foreground", className)}>—</span>;
  const rounded = Math.round(value * 10) / 10;
  const good = invert ? rounded < 0 : rounded > 0;
  const flat = rounded === 0;
  const Icon = flat ? Minus : rounded > 0 ? ArrowUpRight : ArrowDownRight;
  return (
    <span
      className={cn(
        "num inline-flex h-5 shrink-0 items-center gap-0.5 rounded-full px-1.5 text-[11px] font-medium",
        flat ? "bg-muted text-muted-foreground" : good ? "bg-positive-soft text-positive" : "bg-negative-soft text-negative",
        className,
      )}
    >
      <Icon className="size-3" weight="bold" />
      <span dir="ltr">
        {Math.abs(rounded)}
        {suffix || "%"}
      </span>
    </span>
  );
}

/** A dashboard KPI: small muted label, a big tabular number that counts up, then the change chip and a hint. */
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
    <div className={cn("min-w-0 space-y-1.5", className)}>
      <p className="truncate text-[12px] font-medium text-muted-foreground">{label}</p>
      <p className="num truncate text-[26px] leading-none font-semibold tracking-tight text-foreground sm:text-[28px]">{countUpNode(value)}</p>
      {(delta !== undefined || hint) && (
        <div className="flex min-w-0 items-center gap-1.5 text-[11.5px] text-muted-foreground">
          {delta !== undefined && <Delta value={delta} />}
          {hint && <span className="truncate">{hint}</span>}
        </div>
      )}
    </div>
  );
}
