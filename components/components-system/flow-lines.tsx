"use client";

import { useCallback, useEffect, useLayoutEffect, useState } from "react";
import type { FilterKey } from "@/lib/components/types";
import type { CanvasItem } from "./canvas-frame";

interface Line {
  key: string;
  d: string;
  active: boolean;
  label: string;
  mid: { x: number; y: number };
}

const LABELS: Record<FilterKey, string> = { range: "תאריכים", service: "שירות", stage: "שלב" };

/**
 * Draws the links between modules on the table: a thin line from a module that sets a filter
 * (its "out" port) to every module that reacts to it (their "in" port). When that filter is active,
 * the line carries a moving dash, so the owner sees the data flowing between tools.
 */
export function FlowLines({
  container,
  items,
  activeFilters,
  hidden,
}: {
  container: HTMLElement | null;
  items: CanvasItem[];
  activeFilters: FilterKey[];
  hidden?: boolean;
}) {
  const [lines, setLines] = useState<Line[]>([]);
  const [size, setSize] = useState({ w: 0, h: 0 });

  const measure = useCallback(() => {
    if (!container) return;
    const box = container.getBoundingClientRect();
    const rtl = getComputedStyle(container).direction === "rtl";
    const sign = rtl ? -1 : 1;
    const port = (type: string, kind: "in" | "out") => {
      const el = container.querySelector<HTMLElement>(`[data-module="${type}"] [data-port="${kind}"]`);
      if (!el || el.offsetParent === null) return null;
      const r = el.getBoundingClientRect();
      const m = el.closest<HTMLElement>("[data-module]")!.getBoundingClientRect();
      return { x: r.left + r.width / 2 - box.left, y: r.top + r.height / 2 - box.top, top: m.top - box.top };
    };
    // Half the grid gap: lines travel in the gutters between modules, never across them.
    const half = (parseFloat(getComputedStyle(container).columnGap) || 20) / 2;
    const R = 6;

    /** Orthogonal route: out into the source gutter, along the row gap above the target, into its gutter, then in. */
    const route = (a: { x: number; y: number }, b: { x: number; y: number; top: number }) => {
      const gx1 = a.x + sign * half;
      const gx2 = b.x - sign * half;
      const gy = b.top - half;
      const pts: [number, number][] = [
        [a.x, a.y],
        [gx1, a.y],
        [gx1, gy],
        [gx2, gy],
        [gx2, b.y],
        [b.x, b.y],
      ];
      // Drop zero-length legs, then round each corner a little.
      const clean = pts.filter((p, i) => i === 0 || Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]) > 0.5);
      let d = `M ${clean[0][0]} ${clean[0][1]}`;
      for (let i = 1; i < clean.length; i++) {
        const [x, y] = clean[i];
        const next = clean[i + 1];
        if (!next) {
          d += ` L ${x} ${y}`;
          break;
        }
        const [px, py] = clean[i - 1];
        const r1 = Math.min(R, Math.hypot(x - px, y - py) / 2, Math.hypot(next[0] - x, next[1] - y) / 2);
        const ux = Math.sign(x - px), uy = Math.sign(y - py);
        const vx = Math.sign(next[0] - x), vy = Math.sign(next[1] - y);
        d += ` L ${x - ux * r1} ${y - uy * r1} Q ${x} ${y} ${x + vx * r1} ${y + vy * r1}`;
      }
      return { d, mid: { x: (gx1 + gx2) / 2, y: gy } };
    };

    const next: Line[] = [];
    for (const from of items) {
      const outs = (from.emits ?? []).filter((k): k is FilterKey => k !== "customer");
      if (!outs.length || from.pending) continue;
      const a = port(from.type, "out");
      if (!a) continue;
      for (const to of items) {
        if (to.id === from.id || to.pending) continue;
        const shared = outs.filter((k) => to.consumes.includes(k));
        if (!shared.length) continue;
        const b = port(to.type, "in");
        if (!b) continue;
        const { d, mid } = route(a, b);
        const active = shared.some((f) => activeFilters.includes(f));
        next.push({ key: `${from.id}-${to.id}`, d, active, label: shared.map((f) => LABELS[f]).join(" · "), mid });
      }
    }
    setSize({ w: box.width, h: box.height });
    setLines(next);
  }, [container, items, activeFilters]);

  useLayoutEffect(() => {
    measure();
  }, [measure]);

  useEffect(() => {
    if (!container) return;
    let frame = 0;
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    };
    const ro = new ResizeObserver(schedule);
    ro.observe(container);
    container.querySelectorAll("[data-module]").forEach((el) => ro.observe(el));
    window.addEventListener("resize", schedule);
    // Fonts and lazy bodies change module heights after the first paint.
    const t = setTimeout(schedule, 600);
    return () => {
      cancelAnimationFrame(frame);
      ro.disconnect();
      window.removeEventListener("resize", schedule);
      clearTimeout(t);
    };
  }, [container, items, measure]);

  if (hidden || !lines.length) return null;

  return (
    <svg
      aria-hidden
      className="pointer-events-none absolute inset-0 z-0 hidden overflow-visible lg:block"
      width={size.w}
      height={size.h}
      viewBox={`0 0 ${size.w} ${size.h}`}
    >
      {lines
        .slice()
        .sort((x, y) => Number(x.active) - Number(y.active))
        .map((l) => (
          <g key={l.key}>
            <path d={l.d} fill="none" stroke={l.active ? "var(--brand)" : "var(--line)"} strokeWidth={l.active ? 1.5 : 1} className={l.active ? "flow-dash" : undefined} />
            {l.active && (
              <text x={l.mid.x} y={l.mid.y - 4} textAnchor="middle" className="fill-brand text-[10px] font-semibold">
                {l.label}
              </text>
            )}
          </g>
        ))}
    </svg>
  );
}
