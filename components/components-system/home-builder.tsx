"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
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
import { Check, Eye, Loader2, PanelLeftOpen, Pencil, Plus, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { addComponent, removeComponent, reorderComponents, updateComponentConfig } from "@/lib/actions/components";
import { ENTITY_SINGULAR } from "@/lib/components/registry";
import { SIZE_TO_WIDTH, type ComponentSize, type ComponentWidth, type FilterKey } from "@/lib/components/types";
import type { EntityName } from "@/types/domain";
import { cn } from "@/lib/utils";
import { CanvasFrame, DropPlaceholder, type CanvasItem } from "./canvas-frame";
import { ComponentPalette, PaletteCard, type Checklist, type PaletteEntry } from "./component-palette";
import { FilterBar } from "./workspace-filters";

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
        "relative min-h-[calc(100vh-13rem)] rounded-xl border bg-[radial-gradient(circle,var(--border)_1px,transparent_1px)] [background-size:18px_18px] p-4 transition-colors",
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
}: {
  top?: React.ReactNode;
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
  const editable = canManage && !preview;

  useEffect(() => setItems(initialItems), [initialItems]);
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

  async function add(type: string, index?: number) {
    const entry = entryById.get(type);
    if (!entry) return;
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
    startSaving(async () => {
      const res = await addComponent(type, at);
      if (!res.ok) {
        setItems((list) => list.filter((i) => i.id !== temp.id));
        if ("missing" in res) setMissing({ name: entry.name, entities: res.missing });
        else toast.error(res.error);
        return;
      }
      setPaletteSheet(false);
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
    const px = start.clientX + e.delta.x;
    const py = start.clientY + e.delta.y;
    const after = py > overRect.top + overRect.height * 0.75 || (py >= overRect.top + overRect.height * 0.25 && px > overRect.left + overRect.width / 2);
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
    const previous = items;
    setItems(next);
    startSaving(async () => {
      const res = await reorderComponents(next.filter((i) => !i.pending).map((i) => i.id));
      if (!res.ok) {
        toast.error(res.error);
        setItems(previous);
      }
    });
  }

  function resize(id: string, w: ComponentWidth) {
    const previous = items;
    setItems((list) => list.map((i) => (i.id === id ? { ...i, w } : i)));
    startSaving(async () => {
      const res = await updateComponentConfig(id, { w });
      if (!res.ok) {
        toast.error(res.error);
        setItems(previous);
      }
    });
  }

  function remove(id: string) {
    const previous = items;
    setItems((list) => list.filter((i) => i.id !== id));
    startSaving(async () => {
      const res = await removeComponent(id);
      if (!res.ok) {
        toast.error(res.error);
        setItems(previous);
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
          <aside className="sticky top-14 hidden h-[calc(100vh-3.5rem)] w-[300px] shrink-0 border-r bg-background lg:block">{palette}</aside>
        )}

        <div className="min-w-0 flex-1 px-4 py-5 sm:px-6">
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <h1 className="text-lg font-semibold tracking-tight">My Workspace</h1>
            {canManage && (
              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground" aria-live="polite">
                {saving ? (
                  <>
                    <Loader2 className="size-3 animate-spin" /> Saving…
                  </>
                ) : (
                  <>
                    <Check className="size-3" /> All changes saved
                  </>
                )}
              </span>
            )}
            <div className="ml-auto flex items-center gap-2">
              {editable && (
                <Button size="sm" variant="outline" className="lg:hidden" onClick={() => setPaletteSheet(true)}>
                  <PanelLeftOpen />
                  Components
                </Button>
              )}
              {canManage && (
                <Button size="sm" variant={preview ? "default" : "outline"} onClick={togglePreview}>
                  {preview ? <Pencil /> : <Eye />}
                  {preview ? "Edit workspace" : "Preview"}
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
              <div className="flex min-h-[calc(100vh-16rem)] flex-col items-center justify-center text-center">
                <div className="grid size-24 place-items-center rounded-xl border-2 border-dashed border-zinc-300 bg-surface/80">
                  <span className="grid size-11 place-items-center rounded-full bg-brand-soft text-brand">
                    <Plus className="size-5" />
                  </span>
                </div>
                <h2 className="mt-6 text-lg font-semibold">Your workspace is empty</h2>
                <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                  {editable
                    ? "Drag Components from the left panel to build the tools your business needs."
                    : "Your workspace owner hasn't added any Components yet."}
                </p>
                <div className="mt-5 flex flex-wrap justify-center gap-2">
                  {editable && (
                    <Button onClick={() => (window.innerWidth >= 1024 ? add(entries.find((e) => e.recommended && !e.installedId)?.id ?? entries[0].id) : setPaletteSheet(true))}>
                      <Plus />
                      Add Component
                    </Button>
                  )}
                  {!checklist.hasData && (
                    <Button variant="outline" asChild>
                      <Link href="/data/import">
                        <Upload />
                        Import data
                      </Link>
                    </Button>
                  )}
                </div>
              </div>
            ) : (
              <SortableContext items={items.map((i) => i.id)} strategy={rectSortingStrategy}>
                <div className="grid grid-cols-12 gap-4">
                  {display.map((item) =>
                    item === PLACEHOLDER ? (
                      <PlaceholderSlot key={PLACEHOLDER} w={placeholderWidth} name={entryById.get(paletteType!)?.name ?? "Component"} />
                    ) : (
                      <CanvasFrame
                        key={item.id}
                        item={item}
                        body={bodies[item.id]}
                        editable={editable}
                        activeFilters={activeFilters}
                        onResize={(w) => resize(item.id, w)}
                        onRemove={() => remove(item.id)}
                      />
                    ),
                  )}
                </div>
              </SortableContext>
            )}
          </CanvasDropZone>
        </div>
      </div>

      <DragOverlay dropAnimation={null}>
        {paletteType && entryById.get(paletteType) ? <PaletteCard entry={entryById.get(paletteType)!} overlay canManage={canManage} /> : null}
      </DragOverlay>

      <Sheet open={paletteSheet} onOpenChange={setPaletteSheet}>
        <SheetContent side="left" className="w-[320px] p-0">
          <SheetTitle className="sr-only">Components</SheetTitle>
          {palette}
        </SheetContent>
      </Sheet>

      <Dialog open={!!missing} onOpenChange={(o) => !o && setMissing(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{missing?.name} needs more data</DialogTitle>
            <DialogDescription>
              This Component needs {missing?.entities.map((e) => ENTITY_SINGULAR[e]).join(" and ")} data. Import a file or add records, then drag it in again.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMissing(null)}>
              Not now
            </Button>
            <Button asChild>
              <Link href="/data/import">
                <Upload />
                Import Data
              </Link>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DndContext>
  );
}

function PlaceholderSlot({ w, name }: { w: ComponentWidth; name: string }) {
  const { setNodeRef } = useDroppable({ id: PLACEHOLDER });
  return <DropPlaceholder w={w} name={name} innerRef={setNodeRef} />;
}
