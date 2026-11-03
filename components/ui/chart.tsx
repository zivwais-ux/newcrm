"use client";

import { motion, useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";

/**
 * Shared chart language for every dashboard chart (recharts + simple bars):
 * soft dashed gridlines, quiet axes, low-opacity brand gradient fills, rounded bar tops,
 * and bars that grow from 0 on first render.
 */

/** Spread on <CartesianGrid>. */
export const CHART_GRID = { vertical: false, stroke: "var(--border)", strokeOpacity: 0.8, strokeDasharray: "3 5" } as const;

/** Spread on <XAxis>/<YAxis>. */
export const CHART_AXIS = {
  tickLine: false,
  axisLine: false,
  tick: { fontSize: 11, fill: "var(--muted-foreground)" },
} as const;

/** Spread on <Bar>: rounded tops. */
export const CHART_BAR = { radius: [6, 6, 2, 2] as [number, number, number, number], maxBarSize: 36 };

/** Series draw-in timing (pass `reduce` from useReducedMotion). */
export function chartAnimation(reduce: boolean | null) {
  return { isAnimationActive: !reduce, animationDuration: 600, animationEasing: "ease-out" as const };
}

/**
 * A vertical brand gradient for area/bar fills. Call it as a function inside the chart
 * (`{chartGradient("rev-fill")}`) so recharts sees a plain <defs>.
 */
export function chartGradient(id: string, color = "var(--chart-1)", from = 0.22, to = 0) {
  return (
    <defs key={id}>
      <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor={color} stopOpacity={from} />
        <stop offset="100%" stopColor={color} stopOpacity={to} />
      </linearGradient>
    </defs>
  );
}

/** The card a chart tooltip renders into. */
export function ChartTooltipCard({ className, ...props }: React.ComponentProps<"div">) {
  return <div dir="rtl" className={cn("rounded-md border border-border/80 bg-popover/95 px-3 py-2 text-xs shadow-lg backdrop-blur-sm", className)} {...props} />;
}

/** Cursor line for line/area tooltips. */
export const CHART_CURSOR = { stroke: "var(--brand)", strokeOpacity: 0.25, strokeWidth: 1, strokeDasharray: "3 3" } as const;

/** Horizontal meter bar (share of a total) that grows from 0. `value` is 0–100. */
export function GrowBar({
  value,
  className,
  barClassName,
  delay = 0,
}: {
  value: number;
  className?: string;
  barClassName?: string;
  delay?: number;
}) {
  const reduce = useReducedMotion();
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div className={cn("h-1.5 overflow-hidden rounded-full bg-muted", className)}>
      <motion.div
        className={cn("h-full rounded-full bg-gradient-to-l from-chart-1 to-chart-1/70", barClassName)}
        initial={reduce ? false : { width: 0 }}
        animate={{ width: `${pct}%` }}
        transition={{ duration: 0.6, ease: [0.2, 0.7, 0.2, 1], delay: reduce ? 0 : delay }}
      />
    </div>
  );
}
