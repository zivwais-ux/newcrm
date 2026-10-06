"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useDraggable } from "@dnd-kit/core";
import { Check, DotsSixVertical, LinkSimple, MagnifyingGlass, Plus, Question, Sparkle, SquaresFour, UploadSimple } from "@phosphor-icons/react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { CATEGORY_LABELS, type ComponentCategory, type EmitKey, type FilterKey } from "@/lib/components/types";
import { COMPONENT_ICONS } from "./component-store";

export interface PaletteEntry {
  id: string;
  name: string;
  description: string;
  category: ComponentCategory;
  recommended: boolean;
  ready: boolean;
  reason: string;
  installedId: string | null;
  consumes: FilterKey[];
  emits: EmitKey[];
}

export interface Checklist {
  hasData: boolean;
  componentCount: number;
}

const LINK_LABELS: Record<EmitKey, string> = {
  range: "טווח תאריכים",
  service: "שירות",
  stage: "שלב עסקה",
  customer: "לקוח",
};

/** Names of the other modules this one talks to (it filters them, or they filter it). */
export function linkedPartners(entry: PaletteEntry, entries: PaletteEntry[]): string[] {
  const emits = entry.emits.filter((k): k is FilterKey => k !== "customer");
  return entries
    .filter(
      (o) =>
        o.id !== entry.id &&
        (o.consumes.some((k) => emits.includes(k)) || o.emits.some((k) => k !== "customer" && entry.consumes.includes(k as FilterKey))),
    )
    .map((o) => o.name);
}

type Shape = "chart" | "list" | "board" | "chat" | "agenda";
const SHAPES: Record<string, Shape> = {
  "revenue-intelligence": "chart",
  "sales-pipeline": "board",
  "ai-analyst": "chat",
  today: "agenda",
  tasks: "agenda",
};

/**
 * A structural hint of what the module looks like on the table — its layout, not fake data:
 * a number over a line for charts, rows for lists, columns for boards.
 */
function Schematic({ type }: { type: string }) {
  const shape = SHAPES[type] ?? "list";
  return (
    <div className="relative h-[72px] overflow-hidden border-b border-border bg-rail px-3 py-2.5" aria-hidden>
      {shape === "chart" && (
        <>
          <div className="h-2.5 w-14 bg-foreground/80" />
          <div className="mt-1.5 h-1.5 w-8 bg-border-strong" />
          <svg viewBox="0 0 120 30" preserveAspectRatio="none" className="absolute inset-x-3 bottom-2 h-7 w-[calc(100%-1.5rem)]">
            <polyline points="0,24 18,20 34,22 52,13 70,16 88,8 104,10 120,3" fill="none" stroke="var(--brand)" strokeWidth="1.5" />
          </svg>
        </>
      )}
      {shape === "list" && (
        <div className="space-y-2 pt-0.5">
          {[0.8, 0.6, 0.7].map((w, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="size-2 shrink-0 bg-brand/70" />
              <span className="h-1.5 bg-border-strong" style={{ width: `${w * 100}%` }} />
            </div>
          ))}
        </div>
      )}
      {shape === "board" && (
        <div className="grid h-full grid-cols-4 gap-1.5">
          {[3, 2, 2, 1].map((n, c) => (
            <div key={c} className="space-y-1 border-t-2 border-brand/60 pt-1">
              {Array.from({ length: n }, (_, i) => (
                <div key={i} className="h-2.5 border border-border bg-module" />
              ))}
            </div>
          ))}
        </div>
      )}
      {shape === "chat" && (
        <div className="space-y-1.5 pt-0.5">
          <div className="ms-auto h-3 w-1/2 bg-brand/70" />
          <div className="h-3 w-3/4 border border-border bg-module" />
          <div className="h-3 w-2/5 border border-border bg-module" />
        </div>
      )}
      {shape === "agenda" && (
        <div className="space-y-1.5 pt-0.5">
          {["09", "11", "14"].map((h) => (
            <div key={h} className="flex items-center gap-2">
              <span className="num text-[9px] text-muted-foreground">{h}:00</span>
              <span className="h-2.5 flex-1 border-s-2 border-brand bg-brand-soft" />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** One module in the drawer: drag it onto the table, or press + to drop it at the end. */
export function PaletteCard({
  entry,
  onAdd,
  overlay = false,
  canManage,
  partners = [],
}: {
  entry: PaletteEntry;
  onAdd?: () => void;
  overlay?: boolean;
  canManage: boolean;
  partners?: string[];
}) {
  const disabled = !canManage || Boolean(entry.installedId);
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `palette:${entry.id}`,
    data: { kind: "palette", type: entry.id },
    disabled: disabled || overlay,
  });
  const Icon = COMPONENT_ICONS[entry.id] ?? Sparkle;

  return (
    <div
      ref={overlay ? undefined : setNodeRef}
      {...(overlay ? {} : listeners)}
      {...(overlay ? {} : attributes)}
      className={cn(
        "group relative flex flex-col border border-border bg-module text-start shadow-xs transition-[box-shadow,border-color,transform] duration-150",
        !disabled && "cursor-grab hover:-translate-y-0.5 hover:border-brand/40 hover:shadow-block active:cursor-grabbing",
        entry.installedId && "opacity-60 shadow-none",
        isDragging && "opacity-30",
        overlay && "w-64 -rotate-2 cursor-grabbing border-brand shadow-xl",
      )}
      title={disabled ? undefined : "גרור לשולחן"}
    >
      <Schematic type={entry.id} />
      <div className="flex items-start gap-2 p-3">
        <Icon className="mt-0.5 size-[18px] shrink-0 text-brand" />
        <span className="min-w-0 flex-1">
          <span className="block text-[14px] font-semibold leading-tight">{entry.name}</span>
          <span className="mt-1 line-clamp-2 block text-[12px] leading-snug text-muted-foreground">{entry.description}</span>
          {partners.length > 0 && (
            <span className="mt-1.5 flex max-w-full items-center gap-1 text-[11px] text-muted-foreground">
              <LinkSimple className="size-3 shrink-0 text-brand" />
              <span className="truncate">
                מחובר ל{partners.slice(0, 2).join(", ")}
                {partners.length > 2 && ` ועוד ${partners.length - 2}`}
              </span>
            </span>
          )}
          {entry.installedId ? (
            <span className="mt-1.5 flex items-center gap-1 text-[11px] font-medium text-positive">
              <Check className="size-3" weight="bold" />
              כבר על השולחן
            </span>
          ) : (
            !entry.ready && <span className="mt-1.5 block text-[11px] text-warning">{entry.reason}</span>
          )}
        </span>
      </div>
      {!disabled && !overlay && (
        <span className="absolute top-2 end-2 flex items-center gap-0.5">
          <button
            type="button"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={onAdd}
            className="grid size-6 place-items-center border border-border bg-module text-muted-foreground opacity-0 transition-opacity hover:border-brand hover:text-brand group-hover:opacity-100 focus-visible:opacity-100 cursor-pointer"
            aria-label={`הוסף את ${entry.name} לשולחן`}
            title="הוסף לשולחן"
          >
            <Plus className="size-3.5" weight="bold" />
          </button>
          <DotsSixVertical className="size-4 text-border-strong" weight="bold" />
        </span>
      )}
      {entry.recommended && !entry.installedId && !overlay && (
        <span className="absolute -top-px start-3 bg-brand px-1.5 py-0.5 text-[10px] font-semibold text-white">מומלץ</span>
      )}
    </div>
  );
}

function readFlag(key: string) {
  try {
    return localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

function HelpPanel({ entries, checklist }: { entries: PaletteEntry[]; checklist: Checklist }) {
  const [flags, setFlags] = useState({ linked: false, askedAI: false });
  useEffect(() => setFlags({ linked: readFlag("bos.linked"), askedAI: readFlag("bos.askedAI") }), []);
  const steps = [
    { done: checklist.hasData, label: "העלה את נתוני העסק (קובץ אקסל)", href: "/data/import" },
    { done: checklist.componentCount >= 3, label: "גרור 3 מודולים לשולחן" },
    { done: flags.linked, label: "לחץ על שירות או שלב עסקה, וראה את הקו נדלק" },
    { done: flags.askedAI, label: "שאל את היועץ החכם שאלה", href: "/ai" },
  ];
  const doneCount = steps.filter((s) => s.done).length;
  const emitters = entries.filter((e) => e.emits.some((k) => k !== "customer"));

  return (
    <div className="grid gap-x-10 gap-y-6 text-[13px] md:grid-cols-3">
      <section>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="font-semibold">צעדים ראשונים</h3>
          <span className="num text-xs text-muted-foreground" dir="ltr">
            {doneCount}/{steps.length}
          </span>
        </div>
        <div className="mb-3 h-1 bg-muted">
          <div className="h-full bg-brand transition-all" style={{ width: `${(doneCount / steps.length) * 100}%` }} />
        </div>
        <ul className="space-y-2">
          {steps.map((s) => (
            <li key={s.label} className="flex items-start gap-2">
              <span
                className={cn(
                  "mt-0.5 grid size-4 shrink-0 place-items-center rounded-full border",
                  s.done ? "border-positive bg-positive text-white" : "border-border-strong",
                )}
              >
                {s.done && <Check className="size-2.5" weight="bold" />}
              </span>
              {s.href && !s.done ? (
                <Link href={s.href} className="hover:underline">
                  {s.label}
                </Link>
              ) : (
                <span className={cn(s.done && "text-muted-foreground line-through")}>{s.label}</span>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-2">
        <h3 className="font-semibold">איך בונים את השולחן</h3>
        <p className="text-muted-foreground">
          <strong className="font-medium text-foreground">גרור</strong> מודול מהמגירה אל השולחן, או לחץ על + שבפינה שלו.
        </p>
        <p className="text-muted-foreground">
          <strong className="font-medium text-foreground">סדר מחדש</strong> בעזרת הידית ⋮⋮ בפס של המודול.
        </p>
        <p className="text-muted-foreground">
          <strong className="font-medium text-foreground">שנה גודל</strong> בגרירת הקצה של המודול, או מהתפריט (רוחב וגובה).
        </p>
        <p className="text-muted-foreground">
          <strong className="font-medium text-foreground">שורת הפקודה</strong> למעלה מבינה משפטים כמו &quot;מכירה 250 לדנה&quot; או &quot;תור ליוסי מחר ב-10&quot;.
        </p>
      </section>

      <section className="space-y-2">
        <h3 className="flex items-center gap-1.5 font-semibold">
          <LinkSimple className="size-3.5 text-brand" />
          הקווים בין המודולים
        </h3>
        <ul className="space-y-1.5 text-muted-foreground">
          {emitters.map((e) => {
            const targets = entries.filter((o) => o.id !== e.id && o.consumes.some((k) => e.emits.includes(k))).map((o) => o.name);
            return (
              <li key={e.id}>
                ב<span className="font-medium text-foreground">{e.name}</span>: לחיצה על{" "}
                {e.emits
                  .filter((k) => k !== "customer")
                  .map((k) => LINK_LABELS[k])
                  .join(" או ")}{" "}
                מסננת את {targets.length ? targets.join(", ") : "שאר המודולים"}.
              </li>
            );
          })}
          <li>לחיצה על שם של לקוח פותחת את כרטיס הלקוח, בלי לצאת מהשולחן.</li>
        </ul>
        <Link href="/data/import" className="mt-2 inline-flex items-center gap-1.5 font-medium text-brand hover:underline">
          <UploadSimple className="size-4" />
          העלה עוד נתונים
        </Link>
      </section>
    </div>
  );
}

/** The drawer's content: category tabs, search and a grid of modules — or the help tab. */
export function ComponentPalette({
  entries,
  checklist,
  canManage,
  onAdd,
}: {
  entries: PaletteEntry[];
  checklist: Checklist;
  canManage: boolean;
  onAdd: (type: string) => void;
}) {
  const [tab, setTab] = useState<"all" | "recommended" | ComponentCategory | "help">("all");
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const categories = (Object.keys(CATEGORY_LABELS) as ComponentCategory[]).filter((c) => entries.some((e) => e.category === c));
  const hasRecommended = entries.some((e) => e.recommended && !e.installedId);
  const partners = useMemo(() => new Map(entries.map((e) => [e.id, linkedPartners(e, entries)])), [entries]);
  const shown = useMemo(() => {
    let list = entries;
    if (tab === "recommended") list = list.filter((e) => e.recommended && !e.installedId);
    else if (tab !== "all" && tab !== "help") list = list.filter((e) => e.category === tab);
    if (q) list = list.filter((e) => `${e.name} ${e.description} ${CATEGORY_LABELS[e.category]}`.toLowerCase().includes(q));
    // Modules not yet on the table first.
    return [...list].sort((a, b) => Number(Boolean(a.installedId)) - Number(Boolean(b.installedId)) || Number(b.recommended) - Number(a.recommended));
  }, [entries, tab, q]);

  const tabs: { id: typeof tab; label: string }[] = [
    { id: "all", label: "הכל" },
    ...(hasRecommended ? [{ id: "recommended" as const, label: "מומלץ לעסק" }] : []),
    ...categories.map((c) => ({ id: c, label: CATEGORY_LABELS[c] })),
  ];

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center gap-x-1 gap-y-2 border-b border-border px-4 pt-2 sm:px-6">
        <div className="-mb-px flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                "shrink-0 border-b-2 px-2.5 pb-2.5 pt-1.5 text-[13px] font-medium transition-colors cursor-pointer",
                tab === t.id ? "border-brand text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {t.label}
            </button>
          ))}
          <button
            onClick={() => setTab("help")}
            className={cn(
              "flex shrink-0 items-center gap-1 border-b-2 px-2.5 pb-2.5 pt-1.5 text-[13px] font-medium transition-colors cursor-pointer",
              tab === "help" ? "border-brand text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            <Question className="size-3.5" />
            איך זה עובד
          </button>
        </div>
        {tab !== "help" && (
          <div className="relative mb-2 w-full sm:w-56">
            <MagnifyingGlass className="pointer-events-none absolute top-1/2 start-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input dir="auto" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="חיפוש מודול…" className="h-8 ps-8 text-[13px]" />
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-6">
        {tab === "help" ? (
          <HelpPanel entries={entries} checklist={checklist} />
        ) : (
          <>
            {!canManage && (
              <p className="mb-3 bg-muted px-3 py-2 text-xs text-muted-foreground">רק בעלים ומנהלים יכולים לשנות את השולחן.</p>
            )}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
              {shown.map((e) => (
                <PaletteCard key={e.id} entry={e} canManage={canManage} partners={partners.get(e.id)} onAdd={() => onAdd(e.id)} />
              ))}
            </div>
            {!shown.length && (
              <p className="flex items-center justify-center gap-2 py-10 text-[13px] text-muted-foreground">
                <SquaresFour className="size-4" />
                לא נמצאו מודולים{q ? ` עבור "${query}"` : ""}.
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
