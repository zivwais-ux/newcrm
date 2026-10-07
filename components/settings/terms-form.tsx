"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, CircleNotch } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useTerms } from "@/components/layout/workspace-provider";
import { updateTerms } from "@/lib/actions/workspace";
import { TERM_GROUPS, resolveTerms, type Terms } from "@/lib/terms";
import { cn } from "@/lib/utils";

/** "המילים של העסק": how this business names its customers, appointments, services and open deals. */
export function TermsForm({ canManage }: { canManage: boolean }) {
  const router = useRouter();
  const saved = useTerms();
  const [terms, setTerms] = useState<Terms>(saved);
  const [pending, start] = useTransition();
  const dirty = TERM_GROUPS.some((g) => terms[g.singular] !== saved[g.singular] || terms[g.plural] !== saved[g.plural]);
  // What the app will show, with blanks falling back to the defaults (same as the server does).
  const shown = resolveTerms(terms);

  function save() {
    start(async () => {
      const res = await updateTerms(terms);
      if (!res.ok) return void toast.error(res.error);
      toast.success("המילים נשמרו");
      router.refresh();
    });
  }

  return (
    <div className="space-y-5">
      <ol className="divide-y divide-border border-y border-border">
        {TERM_GROUPS.map((g) => {
          const singular = terms[g.singular];
          const plural = terms[g.plural];
          return (
            <li key={g.singular} className="space-y-2.5 py-4">
              <p className="text-[13px] font-medium">{g.question}</p>
              <div className="flex flex-wrap gap-1.5" role="group" aria-label={g.question}>
                {g.suggestions.map(([s, p]) => {
                  const active = s === singular && p === plural;
                  return (
                    <button
                      key={`${s}-${p}`}
                      type="button"
                      disabled={!canManage}
                      aria-pressed={active}
                      onClick={() => setTerms((t) => ({ ...t, [g.singular]: s, [g.plural]: p }))}
                      className={cn(
                        "inline-flex h-7 items-center gap-1 rounded-sm border px-2 text-xs transition-colors active:translate-y-px enabled:cursor-pointer disabled:cursor-default",
                        active
                          ? "border-brand bg-brand-soft font-medium text-brand"
                          : "border-border bg-module text-foreground enabled:hover:border-border-strong enabled:hover:bg-muted/60",
                      )}
                    >
                      {active && <Check className="size-3" weight="bold" />}
                      {s} / {p}
                    </button>
                  );
                })}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-muted-foreground">מילה משלי</span>
                <Input
                  dir="auto"
                  value={singular}
                  maxLength={30}
                  disabled={!canManage}
                  onChange={(e) => setTerms((t) => ({ ...t, [g.singular]: e.target.value }))}
                  aria-label={`${g.question} — ביחיד`}
                  placeholder="ביחיד"
                  className="h-8 w-32 text-[13px]"
                />
                <Input
                  dir="auto"
                  value={plural}
                  maxLength={30}
                  disabled={!canManage}
                  onChange={(e) => setTerms((t) => ({ ...t, [g.plural]: e.target.value }))}
                  aria-label={`${g.question} — ברבים`}
                  placeholder="ברבים"
                  className="h-8 w-32 text-[13px]"
                />
              </div>
            </li>
          );
        })}
      </ol>

      <div className="border border-dashed border-border bg-muted/30 px-3 py-2.5 text-[13px]">
        <span className="text-muted-foreground">כך זה ייראה: </span>
        <span className="font-medium">
          + {shown.appointment} חדש · {shown.customers} שחזרו
        </span>
      </div>

      {canManage ? (
        <Button size="sm" onClick={save} disabled={pending || !dirty}>
          {pending && <CircleNotch className="animate-spin" />}
          שמור מילים
        </Button>
      ) : (
        <p className="text-xs text-muted-foreground">רק בעלים ומנהלים יכולים לשנות את המילים של העסק.</p>
      )}
    </div>
  );
}
