"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  pointerWithin,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { SortableContext, arrayMove, rectSortingStrategy, sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { ArrowLeft, Check, Eye, FileSpreadsheet, Hand, LayoutGrid, Link2, Loader2, MousePointerClick, PanelLeftOpen, Pencil, Plus, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { addComponent, removeComponent, reorderComponents, updateComponentConfig } from "@/lib/actions/components";
import { entitiesText } from "@/lib/components/registry";
import { SIZE_TO_WIDTH, type ComponentSize, type ComponentWidth, type FilterKey } from "@/lib/components/types";
import type { EntityName } from "@/types/domain";
import { cn } from "@/lib/utils";
import { CanvasFileDrop } from "@/components/data-import/canvas-file-drop";
import { CanvasFrame, DropPlaceholder, type CanvasItem } from "./canvas-frame";
import { ComponentPalette, PaletteCard, linkedPartners, type Checklist, type PaletteEntry } from "./component-palette";
import { FilterBar } from "./workspace-filters";
import { CanvasStyles } from "./canvas-styles";

const PLACEHOLDER = "__placeholder__";

// Prefer the card under the pointer; fall back to the canvas itself, then nearest.
const collision: CollisionDetection = (args) => {
  const within = pointerWithin(args);
  const cards = within.filter((c) => c.id !== "canvas");
  if (cards.length) return cards;
  if (within.length) return within;
  return closestCenter(args);
};

function CanvasDropZone({ children, active, empty }: { children: React.ReactNode; active: boolean; empty: boolean }) {
  const { setNodeRef, isOver } = useDroppable({ id: "canvas" });
  return (
    <div
      ref={setNodeRef}
      className={cn(
        "dot-grid relative min-h-[calc(100vh-13rem)] rounded-xl border bg-muted/30 p-4 transition-colors sm:p-5",
        active && "border-dashed border-brand/50",
        active && isOver && empty && "bg-brand-soft/40",
      )}
    >
      {children}
    </div>
  );
}

export function HomeBuilder({
  items: initialItems,
  bodies,
  entries,
  checklist,
  canManage,
  activeFilters,
  top,
  updated = [],
}: {
  top?: React.ReactNode;
  /** Component types that just received imported data — briefly highlighted. */
  updated?: string[];
  items: CanvasItem[];
  bodies: Record<string, React.ReactNode>;
  entries: PaletteEntry[];
  checklist: Checklist;
  canManage: boolean;
  activeFilters: FilterKey[];
}) {
  const router = useRouter();
  const [items, setItems] = useState(initialItems);
  const [preview, setPreview] = useState(false);
  const [paletteSheet, setPaletteSheet] = useState(false);
  const [dragging, setDragging] = useState<{ kind: "palette" | "item"; id: string } | null>(null);
  const [placeholderIndex, setPlaceholderIndex] = useState<number | null>(null);
  const [missing, setMissing] = useState<{ name: string; entities: EntityName[] } | null>(null);
  const [saving, startSaving] = useTransition();
  const [flash, setFlash] = useState<Set<string>>(() => new Set(updated));
  useEffect(() => {
    if (!flash.size) return;
    const t = setTimeout(() => setFlash(new Set()), 4000);
    return () => clearTimeout(t);
  }, [flash]);
  const editable = canManage && !preview;

  // Saves in flight. While any is running, fresh server props would wipe newer optimistic
  // changes, so we defer them and refresh once everything has settled.
  const inFlight = useRef(0);
  const staleProps = useRef(false);
  useEffect(() => {
    if (inFlight.current > 0) staleProps.current = true;
    else setItems(initialItems);
  }, [initialItems]);

  function track(op: () => Promise<void>) {
    inFlight.current++;
    startSaving(async () => {
      try {
        await op();
      } finally {
        inFlight.current--;
        if (inFlight.current === 0 && staleProps.current) {
          staleProps.current = false;
          router.refresh();
        }
      }
    });
  }
  useEffect(() => {
    try {
      setPreview(localStorage.getItem("bos.preview") === "1");
    } catch {
      /* ignore */
    }
  }, []);
  useEffect(() => {
    if (activeFilters.some((f) => f !== "range")) {
      try {
        localStorage.setItem("bos.linked", "1");
      } catch {
        /* ignore */
      }
    }
  }, [activeFilters]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const entryById = useMemo(() => new Map(entries.map((e) => [e.id, e])), [entries]);
  const paletteType = dragging?.kind === "palette" ? dragging.id : null;
  const placeholderWidth: ComponentWidth = paletteType ? defaultWidth(paletteType) : "6";

  function defaultWidth(type: string): ComponentWidth {
    const size = (["revenue-intelligence", "customer-hub", "sales-pipeline"].includes(type) ? "lg" : "md") as ComponentSize;
    return SIZE_TO_WIDTH[size];
  }

  function togglePreview() {
    setPreview((p) => {
      try {
        localStorage.setItem("bos.preview", p ? "0" : "1");
      } catch {
        /* ignore */
      }
      return !p;
    });
  }

  /** After the very first Component lands on the canvas, explain how Components link. */
  function showFirstDropHint() {
    let seen = true;
    try {
      seen = localStorage.getItem("bos.firstDropHint") === "1";
      if (!seen) localStorage.setItem("bos.firstDropHint", "1");
    } catch {
      /* ignore */
    }
    if (!seen) {
      toast("הכלי נוסף למסך", {
        description: "טיפ: לחיצה על שירות בכלי ההכנסות תסנן את הלקוחות בכל שאר הכלים",
        icon: <Link2 className="size-4 text-brand" />,
        duration: 9000,
      });
    }
  }

  async function add(type: string, index?: number) {
    const entry = entryById.get(type);
    if (!entry) return;
    // Already on the canvas (or being added right now): ignore double clicks/drops.
    if (items.some((i) => i.type === type)) return;
    const at = index ?? items.length;
    const temp: CanvasItem = {
      id: `pending-${type}`,
      type,
      name: entry.name,
      description: entry.description,
      w: defaultWidth(type),
      config: {},
      configFields: [],
      consumes: entry.consumes,
      pending: true,
    };
    setItems((list) => [...list.slice(0, at), temp, ...list.slice(at)]);
    track(async () => {
      const res = await addComponent(type, at);
      if (!res.ok) {
        setItems((list) => list.filter((i) => i.id !== temp.id));
        if ("missing" in res) setMissing({ name: entry.name, entities: res.missing });
        else toast.error(res.error);
        return;
      }
      setPaletteSheet(false);
      showFirstDropHint();
      router.refresh();
    });
  }

  function onDragStart(e: DragStartEvent) {
    const kind = e.active.data.current?.kind as "palette" | "item" | undefined;
    if (kind === "palette") setDragging({ kind, id: e.active.data.current?.type as string });
    else setDragging({ kind: "item", id: String(e.active.id) });
  }

  function onDragOver(e: DragOverEvent) {
    if (dragging?.kind !== "palette") return;
    const overId = e.over?.id;
    if (!overId) return;
    if (overId === PLACEHOLDER) return;
    if (overId === "canvas") {
      // Over empty canvas space: keep the current slot, or append.
      setPlaceholderIndex((i) => i ?? items.length);
      return;
    }
    const index = items.findIndex((i) => i.id === overId);
    if (index < 0) return;
    // Decide before/after from the pointer position relative to the hovered card.
    const overRect = e.over!.rect;
    const start = e.activatorEvent as PointerEvent;
    if (typeof start?.clientX !== "number") {
      setPlaceholderIndex(index);
      return;
    }
    const px = start.clientX + e.delta.x;
    const py = start.clientY + e.delta.y;
    // The grid flows right-to-left in RTL, so "after" is the left half of the card there.
    const rtl = getComputedStyle(document.documentElement).direction === "rtl";
    const centerX = overRect.left + overRect.width / 2;
    const pastCenter = rtl ? px < centerX : px > centerX;
    const after = py > overRect.top + overRect.height * 0.75 || (py >= overRect.top + overRect.height * 0.25 && pastCenter);
    setPlaceholderIndex(after ? index + 1 : index);
  }

  function onDragEnd(e: DragEndEvent) {
    const current = dragging;
    const index = placeholderIndex;
    setDragging(null);
    setPlaceholderIndex(null);
    if (!current) return;

    if (current.kind === "palette") {
      if (e.over && index !== null) add(current.id, index);
      else if (e.over?.id === "canvas") add(current.id);
      return;
    }

    if (!e.over || e.active.id === e.over.id || e.over.id === "canvas") return;
    const from = items.findIndex((i) => i.id === e.active.id);
    const to = items.findIndex((i) => i.id === e.over!.id);
    if (from < 0 || to < 0) return;
    const next = arrayMove(items, from, to);
    const previousOrder = items.map((i) => i.id);
    const movedOrder = next.map((i) => i.id);
    setItems(next);
    track(async () => {
      const res = await reorderComponents(next.filter((i) => !i.pending).map((i) => i.id));
      if (!res.ok) {
        toast.error(res.error);
        // Undo only this move, and only if nothing reordered the canvas since.
        setItems((list) => (sameOrder(list, movedOrder) ? restoreOrder(list, previousOrder) : list));
      }
    });
  }

  function resize(id: string, w: ComponentWidth) {
    const previousW = items.find((i) => i.id === id)?.w;
    if (!previousW || previousW === w) return;
    setItems((list) => list.map((i) => (i.id === id ? { ...i, w } : i)));
    track(async () => {
      const res = await updateComponentConfig(id, { w });
      if (!res.ok) {
        toast.error(res.error);
        // Roll back this Component's width only, unless it was resized again meanwhile.
        setItems((list) => list.map((i) => (i.id === id && i.w === w ? { ...i, w: previousW } : i)));
      }
    });
  }

  function remove(id: string) {
    const index = items.findIndex((i) => i.id === id);
    if (index < 0) return;
    const removed = items[index];
    setItems((list) => list.filter((i) => i.id !== id));
    track(async () => {
      const res = await removeComponent(id);
      if (!res.ok) {
        toast.error(res.error);
        // Put back just this Component, where it was.
        setItems((list) => (list.some((i) => i.id === id) ? list : [...list.slice(0, index), removed, ...list.slice(index)]));
      } else router.refresh();
    });
  }

  const display: (CanvasItem | typeof PLACEHOLDER)[] = [...items];
  if (placeholderIndex !== null && paletteType) display.splice(Math.min(placeholderIndex, items.length), 0, PLACEHOLDER);
  const empty = items.length === 0;
  const palette = <ComponentPalette entries={entries} checklist={checklist} canManage={canManage} onAdd={(t) => add(t)} />;

  return (
    <DndContext
      id="home-builder"
      sensors={sensors}
      collisionDetection={collision}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
      onDragCancel={() => {
        setDragging(null);
        setPlaceholderIndex(null);
      }}
    >
      <div className="flex min-h-[calc(100vh-3.5rem)]">
        {editable && (
          <aside className="sticky top-14 hidden h-[calc(100vh-3.5rem)] w-[300px] shrink-0 border-e bg-surface lg:block" aria-label="ספריית הכלים">
            {palette}
          </aside>
        )}

        <div className="min-w-0 flex-1 px-4 py-5 sm:px-6">
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <h1 className="text-xl font-bold tracking-tight">מסך העבודה שלי</h1>
            {canManage && (
              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground" aria-live="polite">
                {saving ? (
                  <>
                    <Loader2 className="size-3 animate-spin" /> שומר…
                  </>
                ) : (
                  <>
                    <Check className="size-3" /> הכל נשמר
                  </>
                )}
              </span>
            )}
            <div className="ms-auto flex items-center gap-2">
              {editable && (
                <Button size="sm" variant="outline" className="lg:hidden" onClick={() => setPaletteSheet(true)}>
                  <PanelLeftOpen className="rtl:-scale-x-100" />
                  ספריית הכלים
                </Button>
              )}
              {canManage && (
                <Button size="sm" variant={preview ? "default" : "outline"} onClick={togglePreview}>
                  {preview ? <Pencil /> : <Eye />}
                  {preview ? "ערוך את המסך" : "תצוגה מקדימה"}
                </Button>
              )}
            </div>
          </div>

          {!empty && top && <div className="mb-4">{top}</div>}
          {!empty && (
            <div className="mb-4">
              <FilterBar />
            </div>
          )}

          <CanvasDropZone active={dragging?.kind === "palette"} empty={empty}>
            {empty && placeholderIndex === null ? (
              <EmptyCanvas
                editable={editable}
                hasData={checklist.hasData}
                onAdd={() => add(entries.find((e) => e.recommended && !e.installedId)?.id ?? entries[0].id)}
                onOpenLibrary={() => setPaletteSheet(true)}
              />
            ) : (
              <SortableContext items={items.map((i) => i.id)} strategy={rectSortingStrategy}>
                <div className="grid grid-cols-12 gap-4">
                  {display.map((item) =>
                    item === PLACEHOLDER ? (
                      <PlaceholderSlot key={PLACEHOLDER} w={placeholderWidth} name={entryById.get(paletteType!)?.name ?? "כלי"} />
                    ) : (
                      <CanvasFrame
                        key={item.id}
                        item={item}
                        body={bodies[item.id]}
                        editable={editable}
                        activeFilters={activeFilters}
                        onResize={(w) => resize(item.id, w)}
                        onRemove={() => remove(item.id)}
                        highlighted={flash.has(item.type)}
                      />
                    ),
                  )}
                </div>
              </SortableContext>
            )}
          </CanvasDropZone>
        </div>
      </div>

      <CanvasStyles />
      <DragOverlay dropAnimation={null}>
        {paletteType && entryById.get(paletteType) ? <PaletteCard entry={entryById.get(paletteType)!} overlay canManage={canManage} partners={linkedPartners(entryById.get(paletteType)!, entries)} /> : null}
      </DragOverlay>

      <Sheet open={paletteSheet} onOpenChange={setPaletteSheet}>
        <SheetContent side="left" className="w-[320px] p-0">
          <SheetTitle className="sr-only">ספריית הכלים</SheetTitle>
          {palette}
        </SheetContent>
      </Sheet>

      <Dialog open={!!missing} onOpenChange={(o) => !o && setMissing(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>לכלי &quot;{missing?.name}&quot; חסרים נתונים</DialogTitle>
            <DialogDescription>
              הכלי הזה צריך {missing ? entitiesText(missing.entities) : ""}. העלה קובץ או הוסף רשומות, ואז גרור אותו שוב למסך.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMissing(null)}>
              לא עכשיו
            </Button>
            <Button asChild>
              <Link href="/data/import">
                <Upload />
                העלה קובץ
              </Link>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <CanvasFileDrop onImported={(types) => setFlash(new Set(types))} />
    </DndContext>
  );
}

function sameOrder(list: CanvasItem[], order: string[]) {
  const present = new Set(list.map((i) => i.id));
  const expected = order.filter((id) => present.has(id));
  const ids = list.filter((i) => order.includes(i.id)).map((i) => i.id);
  return ids.length === expected.length && ids.every((id, k) => id === expected[k]);
}

/** Puts the Components that existed before a move back in their old order; others keep their slots. */
function restoreOrder(list: CanvasItem[], order: string[]) {
  const rank = new Map(order.map((id, k) => [id, k]));
  const known = list.filter((i) => rank.has(i.id)).sort((a, b) => rank.get(a.id)! - rank.get(b.id)!);
  let k = 0;
  return list.map((i) => (rank.has(i.id) ? known[k++] : i));
}

function PlaceholderSlot({ w, name }: { w: ComponentWidth; name: string }) {
  const { setNodeRef } = useDroppable({ id: PLACEHOLDER });
  return <DropPlaceholder w={w} name={name} innerRef={setNodeRef} />;
}

const STEPS = [
  { icon: LayoutGrid, title: "1. בחר כלי מהספרייה", text: "כל כלי עונה על שאלה אחת בעסק" },
  { icon: Hand, title: "2. גרור אותו לכאן", text: "או לחץ על + ליד הכלי" },
  { icon: MousePointerClick, title: "3. הכלים עובדים יחד", text: "לחיצה בכלי אחד מסננת את כל השאר" },
] as const;

/** The empty canvas: a short, guided "how this works" for first-time owners. */
function EmptyCanvas({
  editable,
  hasData,
  onAdd,
  onOpenLibrary,
}: {
  editable: boolean;
  hasData: boolean;
  onAdd: () => void;
  onOpenLibrary: () => void;
}) {
  if (!editable) {
    return (
      <div className="flex min-h-[calc(100vh-16rem)] flex-col items-center justify-center text-center">
        <span className="grid size-12 place-items-center rounded-2xl bg-brand-soft text-brand ring-1 ring-brand/10">
          <LayoutGrid className="size-5" />
        </span>
        <h2 className="mt-4 text-base font-semibold">מסך העבודה עדיין ריק</h2>
        <p className="mt-1 max-w-sm text-[13px] text-muted-foreground">בעל העסק עדיין לא הוסיף כלים למסך. ברגע שיוסיף, תראה אותם כאן.</p>
      </div>
    );
  }
  return (
    <div className="relative flex min-h-[calc(100vh-16rem)] flex-col items-center justify-center px-2 text-center">
      {/* Hint toward the library, which sits on the start side (right in RTL). */}
      <div className="pointer-events-none absolute top-6 start-4 hidden items-center gap-2 text-[13px] font-medium text-brand lg:flex" aria-hidden>
        <ArrowLeft className="bos-nudge size-5 rtl:-scale-x-100" />
        <span className="rounded-sm bg-brand-soft px-3 py-1 shadow-xs ring-1 ring-brand/15">הספרייה כאן — גרור ממנה כלי</span>
      </div>

      <div className="grid size-20 place-items-center rounded-2xl border-2 border-dashed border-brand/30 bg-surface shadow-sm">
        <span className="grid size-11 place-items-center rounded-xl bg-brand-soft text-brand">
          <Plus className="size-5" />
        </span>
      </div>
      <h2 className="mt-5 text-xl font-bold tracking-tight">בנה את מסך העבודה שלך</h2>
      <p className="mt-1.5 max-w-md text-[14px] leading-relaxed text-muted-foreground">
        בחר רק את הכלים שהעסק שלך צריך, וסדר אותם איך שנוח לך. אפשר לשנות הכל בכל רגע.
      </p>

      <ol className="mt-7 grid w-full max-w-2xl gap-3 sm:grid-cols-3">
        {STEPS.map(({ icon: Icon, title, text }) => (
          <li key={title} className="flex flex-col items-center gap-2 rounded-xl border bg-surface px-4 py-5 shadow-xs">
            <span className="grid size-9 place-items-center rounded-lg bg-brand-soft text-brand">
              <Icon className="size-4" />
            </span>
            <span className="text-[14px] font-semibold">{title}</span>
            <span className="text-[12px] leading-snug text-muted-foreground">{text}</span>
          </li>
        ))}
      </ol>

      <div className="mt-7 flex flex-wrap justify-center gap-2">
        <Button className="hidden lg:inline-flex" onClick={onAdd}>
          <Plus />
          הוסף את הכלי המומלץ
        </Button>
        <Button className="lg:hidden" onClick={onOpenLibrary}>
          <LayoutGrid />
          פתח את ספריית הכלים
        </Button>
      </div>
      <Link
        href="/data/import"
        className="mt-4 inline-flex items-center gap-1.5 text-[13px] font-medium text-muted-foreground transition-colors hover:text-brand"
      >
        <FileSpreadsheet className="size-4" />
        {hasData ? "יש לך עוד נתונים? העלה קובץ אקסל" : "העלה קובץ אקסל"}
      </Link>
    </div>
  );
}
