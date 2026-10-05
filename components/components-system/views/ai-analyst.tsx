"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowUp, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ViewProps } from "../shared";
import type { AIAnalystData } from "@/lib/components/loaders";
import { activeFilterKeys, describeFilters, filterLabel } from "@/lib/components/filters";

export const SUGGESTED_PROMPTS = [
  "למה המכירות ירדו?",
  "מי הלקוחות הכי טובים שלי?",
  "לאילו לקוחות כדאי לחזור?",
  "מה השתנה החודש?",
  "אילו עסקאות תקועות?",
];

export function AIAnalystView({ data }: ViewProps<AIAnalystData>) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const context = data?.filters ? describeFilters(data.filters) : null;
  // Questions asked from the canvas carry the filters the user is looking at.
  const ask = (question: string) => router.push(`/ai?q=${encodeURIComponent(context ? `${question} (${context})` : question)}`);
  const chips = data?.filters ? activeFilterKeys(data.filters) : [];

  return (
    <div className="space-y-4">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (q.trim()) ask(q.trim());
        }}
        className="flex items-center gap-2 rounded-lg border bg-surface py-1 pe-1 ps-3 focus-within:ring-2 focus-within:ring-ring/30"
      >
        <Sparkles className="size-4 shrink-0 text-brand" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="שאל כל שאלה על העסק שלך…"
          dir="auto"
          className="h-8 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        />
        <Button type="submit" size="icon-sm" disabled={!q.trim()} aria-label="שאל את היועץ">
          <ArrowUp />
        </Button>
      </form>
      <div className="flex flex-wrap gap-1.5">
        {SUGGESTED_PROMPTS.map((p) => (
          <button
            key={p}
            onClick={() => ask(p)}
            className="rounded-full border bg-surface px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:border-zinc-300 hover:text-foreground cursor-pointer"
          >
            {p}
          </button>
        ))}
      </div>
      {chips.length > 0 && (
        <p className="text-xs text-brand">שואל בתוך הסינון: {chips.map((k) => filterLabel(k, data.filters[k] as string)).join(" · ")}</p>
      )}
      <p className="text-xs text-muted-foreground">התשובות מבוססות על הנתונים שלך בלבד. היועץ יכול לקרוא ולהמליץ, אבל אף פעם לא משנה נתונים בלי אישור שלך.</p>
    </div>
  );
}
