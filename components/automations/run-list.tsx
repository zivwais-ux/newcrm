"use client";

import Link from "next/link";
import type { RunRow } from "@/lib/actions/automations";
import { cn } from "@/lib/utils";
import { RelTime } from "./flow-sentence";

const STATUS: Record<RunRow["status"], { dot: string; word: string }> = {
  done: { dot: "bg-positive", word: "בוצע" },
  skipped: { dot: "bg-border-strong", word: "דילגנו" },
  failed: { dot: "bg-negative", word: "לא הצליח" },
};

/** What the flows did lately: one quiet line per run. */
export function RunList({ runs, showFlow = true, limit }: { runs: RunRow[]; showFlow?: boolean; limit?: number }) {
  const list = limit ? runs.slice(0, limit) : runs;
  return (
    <ul className="divide-y divide-border/70">
      {list.map((r) => {
        const s = STATUS[r.status] ?? STATUS.done;
        return (
          <li key={r.id} className="flex items-start gap-3 px-4 py-2.5 text-[13.5px] sm:px-5">
            <span className={cn("mt-[7px] size-2 shrink-0 rounded-full", s.dot)} aria-hidden />
            <span className="sr-only">{s.word}: </span>
            <span className="min-w-0 flex-1">
              {showFlow && (
                <Link href={`/automations/${r.automation_id}`} className="font-medium hover:text-brand hover:underline underline-offset-4">
                  {r.automation_name}
                </Link>
              )}
              <span className={cn("block truncate text-muted-foreground", !showFlow && "text-foreground")}>{r.summary || s.word}</span>
            </span>
            <RelTime value={r.created_at} className="shrink-0 pt-px text-xs text-muted-foreground" />
          </li>
        );
      })}
    </ul>
  );
}
