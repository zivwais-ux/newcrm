"use client";

import { CaretDown, Minus, Plus } from "@phosphor-icons/react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import type { Option } from "./flow-vocab";

// The pieces of a "sentence of chips": plain words, and chips you tap to choose.

/** A plain word between chips. */
export function Word({ children, className }: { children: React.ReactNode; className?: string }) {
  return <span className={cn("text-[15px] leading-8 text-foreground", className)}>{children}</span>;
}

/** A sentence line: words and chips flowing together, wrapping naturally. */
export function Sentence({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("flex flex-wrap items-center gap-x-1.5 gap-y-2", className)}>{children}</div>;
}

const chipClass =
  "inline-flex h-8 max-w-full cursor-pointer items-center gap-1 rounded-sm border border-brand/25 bg-brand-soft px-2.5 text-[14px] font-medium text-brand transition-[background-color,border-color,transform] duration-150 hover:border-brand/50 active:translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 disabled:cursor-default disabled:opacity-60 data-[state=open]:border-brand";

/** A tappable choice inside a sentence: shows the chosen words, opens the list of other choices. */
export function ChoiceChip({
  value,
  options,
  onChange,
  placeholder = "בחר",
  label,
  disabled,
  groups,
}: {
  value: string | undefined;
  options: Option[];
  onChange: (v: string) => void;
  placeholder?: string;
  /** Accessible name ("מה קורה", "איזה שלב"…). */
  label: string;
  disabled?: boolean;
  /** Optional second group under a heading (e.g. the business's own fields). */
  groups?: { heading: string; options: Option[] }[];
}) {
  const all = [...options, ...(groups ?? []).flatMap((g) => g.options)];
  const current = all.find((o) => o.value === value);
  return (
    <DropdownMenu dir="rtl">
      <DropdownMenuTrigger asChild disabled={disabled}>
        <button type="button" className={cn(chipClass, !current && "border-dashed bg-module text-muted-foreground")} aria-label={`${label}: ${current?.label ?? placeholder}`}>
          <span className="truncate">{current?.label ?? placeholder}</span>
          {!disabled && <CaretDown className="size-3 shrink-0 opacity-70" />}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-80 min-w-52 overflow-y-auto">
        <DropdownMenuRadioGroup value={value ?? ""} onValueChange={onChange}>
          {options.map((o) => (
            <DropdownMenuRadioItem key={o.value} value={o.value} className="items-start py-2">
              <span className="flex min-w-0 flex-col">
                <span>{o.label}</span>
                {o.hint && <span className="text-xs text-muted-foreground">{o.hint}</span>}
              </span>
            </DropdownMenuRadioItem>
          ))}
          {(groups ?? [])
            .filter((g) => g.options.length)
            .map((g) => (
              <div key={g.heading}>
                <DropdownMenuSeparator />
                <DropdownMenuLabel className="px-2 py-1 text-[11px] font-medium text-muted-foreground">{g.heading}</DropdownMenuLabel>
                {g.options.map((o) => (
                  <DropdownMenuRadioItem key={o.value} value={o.value}>
                    {o.label}
                  </DropdownMenuRadioItem>
                ))}
              </div>
            ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** A number you nudge up or down, with its words ("3 ימים"). */
export function Stepper({
  value,
  onChange,
  min = 0,
  max = 365,
  render,
  label,
  disabled,
}: {
  value: number;
  onChange: (n: number) => void;
  min?: number;
  max?: number;
  render: (n: number) => React.ReactNode;
  label: string;
  disabled?: boolean;
}) {
  const btn =
    "grid size-8 shrink-0 cursor-pointer place-items-center text-brand transition-colors hover:bg-brand/10 active:translate-y-px disabled:cursor-default disabled:opacity-35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand/40";
  return (
    <span role="group" aria-label={label} className="inline-flex h-8 items-stretch rounded-sm border border-brand/25 bg-brand-soft text-[14px] font-medium text-brand">
      <button type="button" className={btn} onClick={() => onChange(Math.min(max, value + 1))} disabled={disabled || value >= max} aria-label="עוד">
        <Plus className="size-3.5" weight="bold" />
      </button>
      <span className="flex min-w-14 items-center justify-center border-x border-brand/15 px-2" aria-live="polite">
        {render(value)}
      </span>
      <button type="button" className={btn} onClick={() => onChange(Math.max(min, value - 1))} disabled={disabled || value <= min} aria-label="פחות">
        <Minus className="size-3.5" weight="bold" />
      </button>
    </span>
  );
}

/** Two or three side-by-side choices (כן / לא, אחרי / לפני). */
export function Segmented({
  value,
  options,
  onChange,
  label,
  disabled,
}: {
  value: string;
  options: Option[];
  onChange: (v: string) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <span role="radiogroup" aria-label={label} className="inline-flex h-8 overflow-hidden rounded-sm border border-brand/25 bg-module">
      {options.map((o, i) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            disabled={disabled}
            onClick={() => onChange(o.value)}
            className={cn(
              "cursor-pointer px-3 text-[14px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand/40 disabled:cursor-default",
              i > 0 && "border-s border-brand/20",
              on ? "bg-brand text-white" : "text-brand hover:bg-brand-soft",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </span>
  );
}

/** "3 ימים" / "יום אחד" / "באותו יום" with the number in mono. */
export function DaysWords({ n, zero = "באותו יום", unit = "days" }: { n: number; zero?: string; unit?: "days" | "hours" }) {
  if (n === 0) return <>{zero}</>;
  if (unit === "hours") return n === 1 ? <>שעה אחת</> : n === 2 ? <>שעתיים</> : <><span className="num">{n}</span>&nbsp;שעות</>;
  return n === 1 ? <>יום אחד</> : n === 2 ? <>יומיים</> : <><span className="num">{n}</span>&nbsp;ימים</>;
}
