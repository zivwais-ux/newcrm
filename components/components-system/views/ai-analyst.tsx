"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowUp, Sparkle } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import type { ViewProps } from "../shared";
import type { AIAnalystData } from "@/lib/components/loaders";
import { activeFilterKeys, filterLabel } from "@/lib/components/filters";
import { useStages } from "@/components/layout/workspace-provider";

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
  const chips = data?.filters ? activeFilterKeys(data.filters) : [];
  const stages = useStages();
  // Questions asked from the canvas carry the filters the user is looking at as URL params;
  // the chat shows them as chips and sends them to the analyst separately from the question.
  const ask = (question: string) => {
    const params = new URLSearchParams({ q: question });
    for (const k of chips) params.set(k, String(data.filters[k]));
    router.push(`/ai?${params.toString()}`);
  };

  return (
    <div className="space-y-4">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (q.trim()) ask(q.trim());
        }}
        className="flex items-center gap-2 rounded-lg border bg-surface py-1 pe-1 ps-3 focus-within:ring-2 focus-within:ring-ring/30"
      >
        <Sparkle className="size-4 shrink-0 text-brand" />
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
            className="rounded-sm border bg-surface px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:border-zinc-300 hover:text-foreground cursor-pointer"
          >
            {p}
          </button>
        ))}
      </div>
      {chips.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-muted-foreground">שואל בתוך הסינון:</span>
          {chips.map((k) => (
            <span key={k} className="rounded-sm border border-brand/20 bg-brand-soft px-2 py-0.5 text-xs font-medium text-brand">
              {filterLabel(k, data.filters[k] as string, stages)}
            </span>
          ))}
        </div>
      )}
      <p className="text-xs text-muted-foreground">התשובות מבוססות על הנתונים שלך בלבד. היועץ יכול לקרוא ולהמליץ, אבל אף פעם לא משנה נתונים בלי אישור שלך.</p>
    </div>
  );
}
