"use client";

import { useEffect, useState } from "react";
import { formatNumber } from "@/lib/utils";

/** "עכשיו", "לפני 5 דקות", "לפני 3 שעות", "אתמול", "לפני 4 ימים". */
export function relativeTime(iso: string, now = Date.now()): string {
  const diff = Math.max(0, now - new Date(iso).getTime());
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "עכשיו";
  if (minutes === 1) return "לפני דקה";
  if (minutes < 60) return `לפני ${formatNumber(minutes)} דקות`;
  const hours = Math.floor(minutes / 60);
  if (hours === 1) return "לפני שעה";
  if (hours === 2) return "לפני שעתיים";
  if (hours < 24) return `לפני ${formatNumber(hours)} שעות`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "אתמול";
  if (days === 2) return "שלשום";
  return `לפני ${formatNumber(days)} ימים`;
}

/** Relative time computed in the browser only, so server and client markup always match. */
export function RelativeTime({ value, className }: { value: string; className?: string }) {
  const [text, setText] = useState<string | null>(null);
  useEffect(() => {
    const tick = () => setText(relativeTime(value));
    tick();
    const id = window.setInterval(tick, 60_000);
    return () => window.clearInterval(id);
  }, [value]);
  return (
    <time dateTime={value} className={className}>
      {text ?? " "}
    </time>
  );
}
