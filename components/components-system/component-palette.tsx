"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useDraggable } from "@dnd-kit/core";
import { Check, ChevronDown, CircleHelp, GripVertical, LayoutGrid, Link2, Plus, Search, Sparkles, Upload } from "lucide-react";
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

/** Names of the other Components this one talks to (it filters them, or they filter it). */
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

/** The draggable card for one Component in the library. */
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
  const Icon = COMPONENT_ICONS[entry.id] ?? Sparkles;

  return (
    <div
      ref={overlay ? undefined : setNodeRef}
      {...(overlay ? {} : listeners)}
      {...(overlay ? {} : attributes)}
      className={cn(
        "group flex items-start gap-3 rounded-lg border bg-surface p-3 text-start shadow-xs transition-[box-shadow,border-color,transform] duration-150",
        !disabled && "cursor-grab hover:-translate-y-0.5 hover:border-brand/30 hover:shadow-md active:cursor-grabbing",
        entry.installedId && "bg-muted/40 shadow-none",
        isDragging && "opacity-40",
        overlay && "w-72 -rotate-1 cursor-grabbing border-brand/40 shadow-xl ring-2 ring-brand/20",
      )}
      title={disabled ? undefined : "גרור למסך העבודה"}
    >
      <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-brand-soft text-brand">
        <Icon className="size-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[14px] font-semibold leading-tight">{entry.name}</span>
        <span className="mt-0.5 block text-[12px] leading-snug text-muted-foreground">{entry.description}</span>
        {partners.length > 0 && (
          <span className="mt-1.5 inline-flex max-w-full items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
            <Link2 className="size-3 shrink-0 text-brand" />
            <span className="truncate">
              עובד יחד עם: {partners.slice(0, 2).join(", ")}
              {partners.length > 2 && ` ועוד ${partners.length - 2}`}
            </span>
          </span>
        )}
        {entry.installedId ? (
          <span className="mt-1.5 flex items-center gap-1 text-[11px] font-medium text-positive">
            <Check className="size-3" />
            כבר במסך
          </span>
        ) : (
          !entry.ready && <span className="mt-1.5 block text-[11px] text-warning">{entry.reason}</span>
        )}
      </span>
      {!disabled && !overlay && (
        <span className="flex flex-col items-center gap-1">
          <button
            type="button"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={onAdd}
            className="rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-accent hover:text-foreground group-hover:opacity-100 focus-visible:opacity-100 cursor-pointer"
            aria-label={`הוסף את ${entry.name} למסך`}
            title="הוסף למסך"
          >
            <Plus className="size-3.5" />
          </button>
          <GripVertical className="size-3.5 text-zinc-300" />
        </span>
      )}
    </div>
  );
}

function Section({ title, icon, children, defaultOpen = true }: { title: string; icon?: React.ReactNode; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-1.5 py-1.5 text-[13px] font-medium cursor-pointer"
        aria-expanded={open}
      >
        {icon}
        <span className="flex-1 text-start">{title}</span>
        <ChevronDown className={cn("size-3.5 text-muted-foreground transition-transform", !open && "-rotate-90")} />
      </button>
      {open && <div className="mt-1.5 space-y-2">{children}</div>}
    </section>
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
    { done: checklist.componentCount >= 3, label: "גרור 3 כלים למסך העבודה" },
    { done: flags.linked, label: "לחץ על שירות או שלב עסקה כדי לסנן את כל הכלים" },
    { done: flags.askedAI, label: "שאל את היועץ החכם שאלה", href: "/ai" },
  ];
  const doneCount = steps.filter((s) => s.done).length;
  const emitters = entries.filter((e) => e.emits.some((k) => k !== "customer"));

  return (
    <div className="space-y-6 text-[13px]">
      <section>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="font-semibold">צעדים ראשונים</h3>
          <span className="text-xs text-muted-foreground tabular" dir="ltr">
            {doneCount}/{steps.length}
          </span>
        </div>
        <div className="mb-3 h-1.5 rounded-sm bg-muted">
          <div className="h-full rounded-sm bg-brand transition-all" style={{ width: `${(doneCount / steps.length) * 100}%` }} />
        </div>
        <ul className="space-y-2">
          {steps.map((s) => (
            <li key={s.label} className="flex items-start gap-2">
              <span
                className={cn(
                  "mt-0.5 grid size-4 shrink-0 place-items-center rounded-full border",
                  s.done ? "border-positive bg-positive text-white" : "border-zinc-300",
                )}
              >
                {s.done && <Check className="size-2.5" />}
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
        <h3 className="font-semibold">איך בונים את המסך</h3>
        <p className="text-muted-foreground">
          <strong className="font-medium text-foreground">גרור</strong> כלי מהספרייה אל מסך העבודה, או עמוד עליו ולחץ על +.
        </p>
        <p className="text-muted-foreground">
          <strong className="font-medium text-foreground">סדר מחדש</strong> בעזרת הידית ⋮⋮ שליד שם הכלי.
        </p>
        <p className="text-muted-foreground">
          <strong className="font-medium text-foreground">שנה גודל</strong> בגרירת הקצה השמאלי של הכלי.
        </p>
        <p className="text-muted-foreground">כל שינוי נשמר לבד, וכל הצוות רואה אותו.</p>
      </section>

      <section className="space-y-2">
        <h3 className="flex items-center gap-1.5 font-semibold">
          <Link2 className="size-3.5 text-brand" />
          הכלים עובדים יחד
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
                מסננת את {targets.length ? targets.join(", ") : "שאר הכלים"}.
              </li>
            );
          })}
          <li>לחיצה על שם של לקוח פותחת את כרטיס הלקוח, בלי לצאת מהמסך.</li>
          <li>משימה שתיצור בכל מקום תופיע מיד ב&quot;משימות&quot; וב&quot;למי לחזור&quot;.</li>
        </ul>
      </section>

      <section className="space-y-2">
        <h3 className="font-semibold">הזנה מהירה</h3>
        <p className="text-muted-foreground">
          <strong className="font-medium text-foreground">+ חדש</strong> למעלה (או + בתחתית המסך בנייד) ← &quot;מכירה מהירה&quot; או &quot;תור חדש&quot;. לקוח שעוד
          לא קיים נוסף תוך כדי, עם שם וטלפון.
        </p>
        <p className="text-muted-foreground">
          <strong className="font-medium text-foreground">בנייד:</strong> בתפריט הדפדפן בחר &quot;הוסף למסך הבית&quot;, והמערכת תיפתח כמו אפליקציה.
        </p>
        <p className="text-muted-foreground">
          קובץ שהעלית בטעות? ב<Link href="/data" className="font-medium text-foreground hover:underline">הנתונים שלי</Link> אפשר למחוק אותו יחד עם מה שיובא ממנו.
        </p>
      </section>

      <Link
        href="/data/import"
        className="flex items-center gap-2 rounded-lg border border-dashed px-3 py-2.5 text-muted-foreground transition-colors hover:border-brand/40 hover:text-brand"
      >
        <Upload className="size-4" />
        העלה עוד נתונים
      </Link>
    </div>
  );
}

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
  const [tab, setTab] = useState<"library" | "help">("library");
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const filtered = useMemo(
    () => (q ? entries.filter((e) => `${e.name} ${e.description} ${CATEGORY_LABELS[e.category]}`.toLowerCase().includes(q)) : entries),
    [entries, q],
  );
  const recommended = filtered.filter((e) => e.recommended && !e.installedId);
  const categories = Object.keys(CATEGORY_LABELS) as ComponentCategory[];
  const partners = useMemo(() => new Map(entries.map((e) => [e.id, linkedPartners(e, entries)])), [entries]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-1 border-b px-3 pt-3">
        {(
          [
            ["library", "ספריית הכלים", LayoutGrid],
            ["help", "עזרה", CircleHelp],
          ] as const
        ).map(([id, label, Icon]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={cn(
              "-mb-px flex items-center gap-1.5 border-b-2 px-2 pb-2.5 text-[13px] font-medium transition-colors cursor-pointer",
              tab === id ? "border-foreground text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon className="size-3.5" />
            {label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-3">
        {tab === "help" ? (
          <HelpPanel entries={entries} checklist={checklist} />
        ) : (
          <div className="space-y-4">
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 start-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input dir="auto" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="חיפוש…" className="h-8 ps-8 text-[13px]" />
            </div>
            {canManage && <p className="-mt-1 text-xs text-muted-foreground">גרור כלי אל מסך העבודה, או לחץ על + שליד הכלי.</p>}
            {!canManage && <p className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">רק בעלים ומנהלים יכולים לשנות את מסך העבודה.</p>}
            {recommended.length > 0 && (
              <Section title="מומלץ לעסק שלך" icon={<Sparkles className="size-3.5 text-brand" />}>
                {recommended.map((e) => (
                  <PaletteCard key={`rec-${e.id}`} entry={e} canManage={canManage} partners={partners.get(e.id)} onAdd={() => onAdd(e.id)} />
                ))}
              </Section>
            )}
            {categories.map((cat) => {
              const list = filtered.filter((e) => e.category === cat && !(e.recommended && !e.installedId));
              if (!list.length) return null;
              return (
                <Section key={cat} title={CATEGORY_LABELS[cat]} defaultOpen>
                  {list.map((e) => (
                    <PaletteCard key={e.id} entry={e} canManage={canManage} partners={partners.get(e.id)} onAdd={() => onAdd(e.id)} />
                  ))}
                </Section>
              );
            })}
            {!filtered.length && <p className="py-6 text-center text-xs text-muted-foreground">לא נמצאו כלים עבור &quot;{query}&quot;.</p>}
          </div>
        )}
      </div>
    </div>
  );
}
