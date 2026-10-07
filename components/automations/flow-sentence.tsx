"use client";

import { Fragment, useEffect, useState } from "react";
import { cn, formatDate } from "@/lib/utils";

/**
 * A flow read aloud: describeAutomation's parts ("כאשר… ← ואם… ← אז…") with quiet arrows between them,
 * so the steps stay visible without looking like a diagram.
 */
export function FlowSentence({ text, className, strong = false }: { text: string; className?: string; strong?: boolean }) {
  const parts = text.split(" ← ");
  return (
    <p className={cn("leading-relaxed text-pretty", className)}>
      {parts.map((p, i) => (
        <Fragment key={i}>
          {i > 0 && (
            <span aria-hidden className="mx-1.5 text-muted-foreground/70">
              ←
            </span>
          )}
          <span className={cn(strong && i === 0 && "font-medium")}>{p}</span>
        </Fragment>
      ))}
    </p>
  );
}

function parts(iso: string): [string, number | null, string] {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60_000);
  if (min < 1) return ["עכשיו", null, ""];
  if (min < 60) return min === 1 ? ["לפני דקה", null, ""] : ["לפני ", min, " דק׳"];
  const h = Math.floor(min / 60);
  if (h < 24) return h === 1 ? ["לפני שעה", null, ""] : h === 2 ? ["לפני שעתיים", null, ""] : ["לפני ", h, " שעות"];
  const d = Math.floor(h / 24);
  if (d === 1) return ["אתמול", null, ""];
  if (d < 30) return ["לפני ", d, " ימים"];
  return [formatDate(iso), null, ""];
}

/** "לפני 3 שעות" — computed after mount so server and browser never disagree. */
export function RelTime({ value, className }: { value: string; className?: string }) {
  const [p, setP] = useState<[string, number | null, string] | null>(null);
  useEffect(() => {
    setP(parts(value));
    const t = setInterval(() => setP(parts(value)), 60_000);
    return () => clearInterval(t);
  }, [value]);
  return (
    <time dateTime={value} className={className}>
      {p ? (
        <>
          {p[0]}
          {p[1] !== null && <span className="num">{p[1]}</span>}
          {p[2]}
        </>
      ) : (
        " "
      )}
    </time>
  );
}
