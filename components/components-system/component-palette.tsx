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
  range: "date range",
  service: "service",
  stage: "pipeline stage",
  customer: "customer spotlight",
};

/** The draggable card for one Component in the library. */
export function PaletteCard({ entry, onAdd, overlay = false, canManage }: { entry: PaletteEntry; onAdd?: () => void; overlay?: boolean; canManage: boolean }) {
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
        "group flex items-start gap-3 rounded-md border bg-surface p-3 text-left transition-[box-shadow,border-color]",
        !disabled && "cursor-grab hover:border-zinc-300 hover:shadow-sm active:cursor-grabbing",
        entry.installedId && "bg-muted/40",
        isDragging && "opacity-40",
        overlay && "w-72 rotate-1 cursor-grabbing border-brand/40 shadow-xl",
      )}
      title={disabled ? undefined : "Drag onto the canvas"}
    >
      <span className="grid size-8 shrink-0 place-items-center rounded-md bg-brand-soft text-brand">
        <Icon className="size-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[13px] font-medium leading-tight">{entry.name}</span>
        <span className="mt-0.5 block text-xs leading-snug text-muted-foreground">{entry.description}</span>
        {entry.installedId ? (
          <span className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-medium text-positive">
            <Check className="size-3" />
            On canvas
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
            aria-label={`Add ${entry.name}`}
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
        <span className="flex-1 text-left">{title}</span>
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
    { done: checklist.hasData, label: "Import your business data", href: "/data/import" },
    { done: checklist.componentCount >= 3, label: "Drag 3 Components onto the canvas" },
    { done: flags.linked, label: "Click a service or stage to link Components" },
    { done: flags.askedAI, label: "Ask the AI Business Analyst a question", href: "/ai" },
  ];
  const doneCount = steps.filter((s) => s.done).length;
  const emitters = entries.filter((e) => e.emits.some((k) => k !== "customer"));

  return (
    <div className="space-y-6 text-[13px]">
      <section>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="font-medium">Getting started</h3>
          <span className="text-xs text-muted-foreground tabular">
            {doneCount}/{steps.length}
          </span>
        </div>
        <div className="mb-3 h-1 rounded-full bg-muted">
          <div className="h-full rounded-full bg-brand transition-all" style={{ width: `${(doneCount / steps.length) * 100}%` }} />
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
        <h3 className="font-medium">Building your workspace</h3>
        <p className="text-muted-foreground">
          <strong className="font-medium text-foreground">Drag</strong> a Component from the library onto the canvas, or hover it and press +.
        </p>
        <p className="text-muted-foreground">
          <strong className="font-medium text-foreground">Rearrange</strong> with the ⋮⋮ handle, and{" "}
          <strong className="font-medium text-foreground">resize</strong> by dragging a card&apos;s right edge.
        </p>
        <p className="text-muted-foreground">Every change is saved automatically for your whole team.</p>
      </section>

      <section className="space-y-2">
        <h3 className="flex items-center gap-1.5 font-medium">
          <Link2 className="size-3.5 text-brand" />
          Components work together
        </h3>
        <ul className="space-y-1.5 text-muted-foreground">
          {emitters.map((e) => (
            <li key={e.id}>
              <span className="font-medium text-foreground">{e.name}</span> → click a{" "}
              {e.emits
                .filter((k) => k !== "customer")
                .map((k) => LINK_LABELS[k])
                .join(" or ")}{" "}
              to filter{" "}
              {entries
                .filter((o) => o.id !== e.id && o.consumes.some((k) => e.emits.includes(k)))
                .map((o) => o.name)
                .join(", ") || "other Components"}
              .
            </li>
          ))}
          <li>Click any customer name to open their spotlight without leaving Home.</li>
          <li>Tasks you create anywhere appear in Tasks and Follow-up Radar instantly.</li>
        </ul>
      </section>

      <Link
        href="/data/import"
        className="flex items-center gap-2 rounded-md border border-dashed px-3 py-2.5 text-muted-foreground transition-colors hover:border-zinc-300 hover:text-foreground"
      >
        <Upload className="size-4" />
        Import more data
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

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-1 border-b px-3 pt-3">
        {(
          [
            ["library", "Components", LayoutGrid],
            ["help", "Help", CircleHelp],
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
              <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search components…" className="h-8 pl-8 text-[13px]" />
            </div>
            {!canManage && <p className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">Only owners and admins can change the canvas.</p>}
            {recommended.length > 0 && (
              <Section title="Recommended" icon={<Sparkles className="size-3.5 text-brand" />}>
                {recommended.map((e) => (
                  <PaletteCard key={`rec-${e.id}`} entry={e} canManage={canManage} onAdd={() => onAdd(e.id)} />
                ))}
              </Section>
            )}
            {categories.map((cat) => {
              const list = filtered.filter((e) => e.category === cat && !(e.recommended && !e.installedId));
              if (!list.length) return null;
              return (
                <Section key={cat} title={CATEGORY_LABELS[cat]} defaultOpen>
                  {list.map((e) => (
                    <PaletteCard key={e.id} entry={e} canManage={canManage} onAdd={() => onAdd(e.id)} />
                  ))}
                </Section>
              );
            })}
            {!filtered.length && <p className="py-6 text-center text-xs text-muted-foreground">No Components match “{query}”.</p>}
          </div>
        )}
      </div>
    </div>
  );
}
