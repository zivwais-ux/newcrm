"use client";

import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "motion/react";

const DURATION = 600;
/** First number in a formatted string: "₪12,345.5", "38%", "14 ימים", "-3". */
const NUMBER = /-?\d[\d,]*(?:\.\d+)?/;

interface Parsed {
  prefix: string;
  suffix: string;
  value: number;
  decimals: number;
  grouped: boolean;
}

function parse(text: string): Parsed | null {
  const m = NUMBER.exec(text);
  if (!m) return null;
  const raw = m[0];
  const value = Number(raw.replace(/,/g, ""));
  if (!Number.isFinite(value)) return null;
  return {
    prefix: text.slice(0, m.index),
    suffix: text.slice(m.index + raw.length),
    value,
    decimals: raw.includes(".") ? raw.split(".")[1].length : 0,
    grouped: raw.includes(","),
  };
}

/** Re-formats like the original string: same decimals, same thousands commas. */
function render(p: Parsed, n: number) {
  const fixed = Math.abs(n).toFixed(p.decimals);
  const [int, frac] = fixed.split(".");
  const body = p.grouped || Math.abs(p.value) >= 1000 ? int.replace(/\B(?=(\d{3})+(?!\d))/g, ",") : int;
  const sign = n < 0 && Number(fixed) !== 0 ? "-" : "";
  return `${p.prefix}${sign}${body}${frac ? `.${frac}` : ""}${p.suffix}`;
}

const ease = (t: number) => 1 - Math.pow(1 - t, 3);

/**
 * Counts a formatted number up from 0 when it first comes into view, and glides to the new
 * value when it changes. Takes the already-formatted text (currency, %, units), so server
 * components can pass it. Screen readers get the final text; reduced motion shows it at once.
 */
export function CountUp({ text, className }: { text: string; className?: string }) {
  const reduce = useReducedMotion();
  const parsed = parse(text);
  const [shown, setShown] = useState(() => (parsed ? render(parsed, 0) : text));
  const ref = useRef<HTMLSpanElement>(null);
  const from = useRef(0);
  const started = useRef(false);

  useEffect(() => {
    const target = parse(text);
    if (!target) {
      setShown(text);
      return;
    }
    if (reduce) {
      from.current = target.value;
      setShown(text);
      return;
    }
    let raf = 0;
    const run = () => {
      started.current = true;
      const start = performance.now();
      const a = from.current;
      const tick = (now: number) => {
        const t = Math.min(1, (now - start) / DURATION);
        const v = a + (target.value - a) * ease(t);
        from.current = v;
        setShown(t >= 1 ? text : render(target, v));
        if (t < 1) raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    };

    const el = ref.current;
    // Later changes animate right away; the first count waits until the number is on screen.
    if (started.current || !el || typeof IntersectionObserver === "undefined") {
      run();
      return () => cancelAnimationFrame(raf);
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          io.disconnect();
          run();
        }
      },
      { threshold: 0.2 },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [text, reduce]);

  if (!parsed) return <span className={className}>{text}</span>;
  return (
    <span ref={ref} className={className}>
      <span aria-hidden className="tabular">
        {shown}
      </span>
      <span className="sr-only">{text}</span>
    </span>
  );
}
