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
import { Check, CircleNotch, Eye, FileXls, LinkSimple, PencilSimple, Plus, SquaresFour, Terminal, UploadSimple, X } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { addComponent, removeComponent, reorderComponents, updateComponentConfig } from "@/lib/actions/components";
import { entitiesText } from "@/lib/components/registry";
import { SIZE_TO_WIDTH, type ComponentHeight, type ComponentSize, type ComponentWidth, type FilterKey } from "@/lib/components/types";
import type { EntityName } from "@/types/domain";
import { cn } from "@/lib/utils";
import { CanvasFileDrop } from "@/components/data-import/canvas-file-drop";
import { CanvasFrame, DropPlaceholder, type CanvasItem } from "./canvas-frame";
import { ComponentPalette, PaletteCard, linkedPartners, type Checklist, type PaletteEntry } from "./component-palette";
import { FilterBar } from "./workspace-filters";
import { CanvasStyles } from "./canvas-styles";
import { FlowLines } from "./flow-lines";
import { Greeting } from "@/components/layout/greeting";
import { useWorkspace } from "@/components/layout/workspace-provider";
import { OPEN_DRAWER_EVENT } from "@/components/layout/dock";
import { openCommandBar } from "@/components/layout/command-bar";

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
        "dot-grid grain relative min-h-[calc(100dvh-15rem)] border border-border bg-table p-3 transition-colors sm:p-5",
        active && "border-dashed border-brand/60",
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
  const [showLines, setShowLines] = useState(true);
  const [grid, setGrid] = useState<HTMLDivElement | null>(null);
  const { user } = useWorkspace();
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
      setShowLines(localStorage.getItem("bos.lines") !== "0");
    } catch {
      /* ignore */
    }
    const openDrawer = () => setPaletteSheet(true);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setPaletteSheet(false);
    window.addEventListener(OPEN_DRAWER_EVENT, openDrawer);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener(OPEN_DRAWER_EVENT, openDrawer);
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  function toggleLines() {
    setShowLines((v) => {
      try {
        localStorage.setItem("bos.lines", v ? "0" : "1");
      } catch {
        /* ignore */
      }
      return !v;
    });
  }
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
      toast("המודול נוסף לשולחן", {
        description: "טיפ: לחיצה על שירות במודול ההכנסות מסננת את כל המודולים המחוברים, והקו ביניהם נדלק",
        icon: <LinkSimple className="size-4 text-brand" />,
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
      emits: entry.emits,
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

  function setHeight(id: string, h: ComponentHeight) {
    const previous = items.find((i) => i.id === id)?.h ?? "regular";
    if (previous === h) return;
    setItems((list) => list.map((i) => (i.id === id ? { ...i, h } : i)));
    track(async () => {
      const res = await updateComponentConfig(id, { h });
      if (!res.ok) {
        toast.error(res.error);
        setItems((list) => list.map((i) => (i.id === id && i.h === h ? { ...i, h: previous } : i)));
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
      <div className="mx-auto max-w-[1600px] px-3 pt-5 sm:px-5">
        <div className="mb-4 flex flex-wrap items-end gap-x-4 gap-y-3">
          <div className="min-w-0">
            <Greeting name={user.name} />
          </div>
          <div className="ms-auto flex flex-wrap items-center gap-2">
            {canManage && (
              <span className="me-1 inline-flex items-center gap-1 text-xs text-muted-foreground" aria-live="polite">
                {saving ? (
                  <>
                    <CircleNotch className="size-3 animate-spin" /> שומר…
                  </>
                ) : (
                  <>
                    <Check className="size-3" weight="bold" /> הכל נשמר
                  </>
                )}
              </span>
            )}
            {!empty && (
              <Button
                size="sm"
                variant="outline"
                className="hidden lg:inline-flex"
                aria-pressed={showLines}
                onClick={toggleLines}
                title="הקווים מראים איך המודולים מחוברים"
              >
                <LinkSimple className={cn(showLines && "text-brand")} />
                {showLines ? "הסתר חיבורים" : "הצג חיבורים"}
              </Button>
            )}
            {canManage && (
              <Button size="sm" variant="outline" onClick={togglePreview}>
                {preview ? <PencilSimple /> : <Eye />}
                {preview ? "ערוך" : "תצוגה"}
              </Button>
            )}
            {editable && (
              <Button size="sm" variant="brand" onClick={() => setPaletteSheet(true)}>
                <SquaresFour />
                מודולים
              </Button>
            )}
          </div>
        </div>

        {!empty && top && <div className="mb-4">{top}</div>}
        {!empty && (
          <div className="mb-3">
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
              <div ref={setGrid} className="relative grid grid-cols-12 gap-4 lg:gap-5">
                {showLines && <FlowLines container={grid} items={items} activeFilters={activeFilters} hidden={!!dragging} />}
                {display.map((item) =>
                  item === PLACEHOLDER ? (
                    <PlaceholderSlot key={PLACEHOLDER} w={placeholderWidth} name={entryById.get(paletteType!)?.name ?? "מודול"} />
                  ) : (
                    <CanvasFrame
                      key={item.id}
                      item={item}
                      index={items.indexOf(item) + 1}
                      body={bodies[item.id]}
                      editable={editable}
                      activeFilters={activeFilters}
                      onResize={(w) => resize(item.id, w)}
                      onHeight={(h) => setHeight(item.id, h)}
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

      {/* The module drawer. A plain fixed panel (not a modal) so a card can be dragged out of it onto the table. */}
      {editable && (
        <>
          <div
            aria-hidden
            onClick={() => setPaletteSheet(false)}
            className={cn(
              "fixed inset-0 z-40 bg-foreground/10 transition-opacity duration-300",
              paletteSheet && !paletteType ? "opacity-100" : "pointer-events-none opacity-0",
            )}
          />
          <section
            aria-label="מגירת המודולים"
            aria-hidden={!paletteSheet}
            inert={!paletteSheet}
            className={cn(
              "fixed inset-x-0 bottom-0 z-50 flex h-[min(64dvh,600px)] flex-col border-t border-border-strong bg-background shadow-xl transition-transform duration-300 ease-out motion-reduce:transition-none",
              !paletteSheet ? "translate-y-full" : paletteType ? "translate-y-[calc(100%-3rem)]" : "translate-y-0",
            )}
          >
            <div className="flex h-12 shrink-0 items-center gap-2 border-b border-border bg-rail px-4 sm:px-6">
              <SquaresFour className="size-[18px] text-brand" />
              <h2 className="text-[14px] font-semibold">{paletteType ? "שחרר את המודול על השולחן" : "מגירת המודולים"}</h2>
              {!paletteType && <span className="hidden text-xs text-muted-foreground sm:inline">גרור מודול לשולחן, או לחץ על + שבפינה שלו</span>}
              <Button variant="ghost" size="icon-sm" className="ms-auto" onClick={() => setPaletteSheet(false)} aria-label="סגור את המגירה">
                <X />
              </Button>
            </div>
            <div className="min-h-0 flex-1">{palette}</div>
          </section>
        </>
      )}

      <CanvasStyles />
      <DragOverlay dropAnimation={null}>
        {paletteType && entryById.get(paletteType) ? <PaletteCard entry={entryById.get(paletteType)!} overlay canManage={canManage} partners={linkedPartners(entryById.get(paletteType)!, entries)} /> : null}
      </DragOverlay>


      <Dialog open={!!missing} onOpenChange={(o) => !o && setMissing(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>למודול &quot;{missing?.name}&quot; חסרים נתונים</DialogTitle>
            <DialogDescription>
              המודול הזה צריך {missing ? entitiesText(missing.entities) : ""}. העלה קובץ או הוסף רשומות, ואז גרור אותו שוב לשולחן.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMissing(null)}>
              לא עכשיו
            </Button>
            <Button asChild>
              <Link href="/data/import">
                <UploadSimple />
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

/** Ghost outlines on the empty table: where modules will sit (wide, half, third…). */
const GHOSTS = ["lg:col-span-8", "lg:col-span-4", "lg:col-span-4", "lg:col-span-4", "lg:col-span-4"];

/** The empty table: ghost slots showing the bento layout, and two ways to start. */
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
  return (
    <div className="relative min-h-[calc(100dvh-17rem)]">
      <div className="pointer-events-none grid grid-cols-12 gap-4 opacity-70 lg:gap-5" aria-hidden>
        {GHOSTS.map((span, i) => (
          <div key={i} className={cn("col-span-12 h-40 border border-dashed border-border-strong", span, i > 1 && "hidden lg:block")}>
            <div className="flex h-9 items-center gap-2 border-b border-dashed border-border-strong px-3">
              <span className="num text-[11px] text-muted-foreground">{String(i + 1).padStart(2, "0")}</span>
              <span className="h-1.5 w-16 bg-border" />
            </div>
          </div>
        ))}
      </div>

      <div className="absolute inset-0 flex items-center justify-center p-4">
        <div className="w-full max-w-md border border-border bg-module p-6 text-center shadow-xl sm:p-8">
          {editable ? (
            <>
              <span className="mx-auto grid size-12 place-items-center bg-brand text-white">
                <Plus className="size-6" weight="bold" />
              </span>
              <h2 className="mt-4 text-xl font-bold tracking-tight">השולחן שלך ריק. בוא נבנה אותו.</h2>
              <p className="mx-auto mt-1.5 max-w-sm text-[14px] leading-relaxed text-muted-foreground">
                כל מודול עונה על שאלה אחת בעסק. גרור לשולחן רק את מה שאתה צריך, והם יתחברו ביניהם לבד.
              </p>
              <div className="mt-6 grid gap-2 sm:grid-cols-2">
                <Button variant="brand" onClick={onOpenLibrary}>
                  <SquaresFour />
                  פתח את המגירה
                </Button>
                <Button variant="outline" onClick={onAdd}>
                  <Plus />
                  הוסף את המומלץ
                </Button>
              </div>
              <button
                type="button"
                onClick={() => openCommandBar("הוסף מודול ")}
                className="mt-4 inline-flex items-center gap-1.5 text-[13px] text-muted-foreground transition-colors hover:text-brand cursor-pointer"
              >
                <Terminal className="size-4" />
                או כתוב: &quot;הוסף מודול הכנסות&quot;
              </button>
              <Link
                href="/data/import"
                className="mt-2 flex items-center justify-center gap-1.5 text-[13px] font-medium text-muted-foreground transition-colors hover:text-brand"
              >
                <FileXls className="size-4" />
                {hasData ? "יש לך עוד נתונים? העלה קובץ אקסל" : "קודם כל: העלה קובץ אקסל של העסק"}
              </Link>
            </>
          ) : (
            <>
              <span className="mx-auto grid size-12 place-items-center bg-brand-soft text-brand">
                <SquaresFour className="size-6" />
              </span>
              <h2 className="mt-4 text-base font-semibold">השולחן עדיין ריק</h2>
              <p className="mx-auto mt-1 max-w-sm text-[13px] text-muted-foreground">בעל העסק עדיין לא הוסיף מודולים. ברגע שיוסיף, תראה אותם כאן.</p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
