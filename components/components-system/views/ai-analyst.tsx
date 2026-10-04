"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowUp, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ViewProps } from "../shared";

export const SUGGESTED_PROMPTS = [
  "Why are sales down?",
  "Who are my top customers?",
  "Which customers need attention?",
  "What changed this month?",
  "Which deals are at risk?",
];

export function AIAnalystView(props: ViewProps<unknown>) {
  void props;
  const router = useRouter();
  const [q, setQ] = useState("");
  const ask = (question: string) => router.push(`/ai?q=${encodeURIComponent(question)}`);

  return (
    <div className="space-y-4">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (q.trim()) ask(q.trim());
        }}
        className="flex items-center gap-2 rounded-md border bg-surface py-1 pr-1 pl-3 focus-within:ring-2 focus-within:ring-ring/30"
      >
        <Sparkles className="size-4 shrink-0 text-brand" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Ask anything about your business…"
          className="h-8 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        />
        <Button type="submit" size="icon-sm" disabled={!q.trim()} aria-label="Ask">
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
      <p className="text-xs text-muted-foreground">Answers are computed from your own data. The AI can read and recommend — it never changes data without you.</p>
    </div>
  );
}
