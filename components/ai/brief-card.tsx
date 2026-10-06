"use client";

import { useState } from "react";
import Link from "next/link";
import { RefreshCw, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { Brief } from "@/lib/analytics/brief";
import { cn, formatDate, plural } from "@/lib/utils";
import { withLtr } from "./rich-text";

export function BriefCard({ initial }: { initial: Brief }) {
  const [brief, setBrief] = useState(initial);
  const [loading, setLoading] = useState(false);

  async function refresh() {
    setLoading(true);
    try {
      const res = await fetch("/api/ai/brief", { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setBrief(json);
    } catch (e) {
      toast.error((e as Error).message || "לא הצלחנו לרענן את הסיכום כרגע. נסה שוב.");
    } finally {
      setLoading(false);
    }
  }

  const highValueIds = brief.facts.highValueAtRisk.map((c) => c.id);

  return (
    <section className="rounded-xl border bg-surface p-5 shadow-sm" aria-label="הסיכום היומי של היועץ">
      <div className="mb-3 flex items-center gap-2">
        <span className="grid size-7 place-items-center rounded-lg bg-brand-soft text-brand">
          <Sparkles className="size-3.5" />
        </span>
        <h2 className="text-[15px] font-semibold">הסיכום היומי</h2>
        <span className="text-xs text-muted-foreground">· {formatDate(brief.generatedAt)}</span>
        <Button variant="ghost" size="icon-sm" className="ms-auto text-muted-foreground" onClick={refresh} disabled={loading} aria-label="רענן סיכום">
          <RefreshCw className={cn(loading && "animate-spin")} />
        </Button>
      </div>
      <div className={cn("max-w-3xl space-y-2.5 text-[15px] leading-relaxed text-zinc-700 transition-opacity", loading && "opacity-50")}>
        {brief.text.split(/\n{2,}/).map((p, i) => (
          <p key={i}>{withLtr(p)}</p>
        ))}
      </div>
      {brief.facts.hasData && (
        <div className="mt-4 flex flex-wrap gap-2">
          <Button asChild size="sm" variant="outline" className="rounded-sm">
            <Link href={`/ai?q=${encodeURIComponent("מה השתנה החודש?")}`}>מה השתנה החודש?</Link>
          </Button>
          {highValueIds.length > 0 && (
            <Button asChild size="sm" variant="ghost" className="rounded-sm">
              <Link href={`/customers?ids=${highValueIds.join(",")}&title=${encodeURIComponent("לקוחות חשובים שצריכים תשומת לב")}`}>
                הצג {plural(highValueIds.length, "לקוח חשוב", "לקוחות חשובים")}
              </Link>
            </Button>
          )}
        </div>
      )}
      {!brief.aiUsed && brief.facts.hasData && (
        <p className="mt-3 text-[11px] text-muted-foreground">הופק על ידי מנוע הניתוח המובנה מתוך הנתונים שלך.</p>
      )}
    </section>
  );
}
