"use client";

import { useId, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { CircleNotch, DotsSixVertical, Plus, Trash } from "@phosphor-icons/react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useStages, useTerms } from "@/components/layout/workspace-provider";
import { saveStages } from "@/lib/actions/workspace";
import { cn, formatNumber } from "@/lib/utils";
import type { StageKind } from "@/types/domain";

interface Row {
  /** Stable id for the list (the stage key, or a temporary id for a new stage). */
  id: string;
  /** Saved stage key, or null for a stage that isn't saved yet. */
  key: string | null;
  label: string;
  kind: StageKind;
}

const MAX_STAGES = 20;

/** "שלבי העבודה": the business's own deal stages — rename, reorder, add and remove open stages. */
export function StagesForm({ canManage }: { canManage: boolean }) {
  const router = useRouter();
  const saved = useStages();
  const terms = useTerms();
  const [rows, setRows] = useState<Row[]>(() => saved.map((s) => ({ id: s.key, key: s.key, label: s.label, kind: s.kind })));
  const [removing, setRemoving] = useState<Row | null>(null);
  const [moveTo, setMoveTo] = useState<string>("");
  const [pending, start] = useTransition();
  const nextId = useRef(0);
  const dndId = useId();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const savedSig = saved.map((s) => `${s.key}:${s.label}`).join("|");
  const dirty = rows.map((r) => `${r.key}:${r.label}`).join("|") !== savedSig;
  const openCount = rows.filter((r) => r.kind === "open").length;

  function update(id: string, label: string) {
    setRows((list) => list.map((r) => (r.id === id ? { ...r, label } : r)));
  }

  function add() {
    const id = `new-${nextId.current++}`;
    // New stages go right before the closing stages (won/lost), so they stay last.
    setRows((list) => {
      const at = list.findIndex((r) => r.kind !== "open");
      const next = [...list];
      next.splice(at === -1 ? list.length : at, 0, { id, key: null, label: "", kind: "open" });
      return next;
    });
    requestAnimationFrame(() => document.getElementById(`stage-${id}`)?.focus());
  }

  function onDragEnd(e: DragEndEvent) {
    if (!e.over || e.active.id === e.over.id) return;
    setRows((list) => {
      const from = list.findIndex((r) => r.id === e.active.id);
      const to = list.findIndex((r) => r.id === e.over!.id);
      return from < 0 || to < 0 ? list : arrayMove(list, from, to);
    });
  }

  function submit(list: Row[], target?: string, done?: () => void) {
    start(async () => {
      const res = await saveStages(
        list.map((r) => ({ key: r.key, label: r.label.trim(), kind: r.kind })),
        target,
      );
      if (!res.ok) return void toast.error(res.error);
      done?.();
      toast.success(res.data.moved ? `השלבים נשמרו. ${terms.deals} שהועברו: ${formatNumber(res.data.moved)}` : "השלבים נשמרו");
      router.refresh();
    });
  }

  /** Ask before removing a saved stage: its deals move to another stage, and the removal is saved right away. */
  function askRemove(row: Row) {
    if (!row.key) return setRows((list) => list.filter((r) => r.id !== row.id));
    const first = rows.find((r) => r.kind === "open" && r.key && r.id !== row.id);
    setMoveTo(first?.key ?? "");
    setRemoving(row);
  }

  // Deals can move only to stages that already exist (saved), other than the one being removed.
  const targets = removing ? rows.filter((r) => r.key && r.id !== removing.id) : [];

  return (
    <div className="space-y-4">
      <DndContext id={dndId} sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={rows.map((r) => r.id)} strategy={verticalListSortingStrategy}>
          <ol className="divide-y divide-border border-y border-border">
            {rows.map((r, i) => (
              <StageRow
                key={r.id}
                row={r}
                index={i}
                canManage={canManage}
                canRemove={r.kind === "open" && openCount > 1}
                onChange={(label) => update(r.id, label)}
                onRemove={() => askRemove(r)}
              />
            ))}
          </ol>
        </SortableContext>
      </DndContext>

      {canManage ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Button variant="outline" size="sm" onClick={add} disabled={rows.length >= MAX_STAGES}>
            <Plus />
            הוסף שלב
          </Button>
          <div className="flex items-center gap-2">
            {dirty && (
              <Button
                variant="ghost"
                size="sm"
                disabled={pending}
                onClick={() => setRows(saved.map((s) => ({ id: s.key, key: s.key, label: s.label, kind: s.kind })))}
              >
                בטל שינויים
              </Button>
            )}
            <Button size="sm" onClick={() => submit(rows)} disabled={pending || !dirty}>
              {pending && <CircleNotch className="animate-spin" />}
              שמור שלבים
            </Button>
          </div>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">רק בעלים ומנהלים יכולים לשנות את שלבי העבודה.</p>
      )}

      <Dialog open={Boolean(removing)} onOpenChange={(o) => !o && !pending && setRemoving(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>להסיר את השלב &quot;{removing?.label}&quot;?</DialogTitle>
            <DialogDescription>השינוי יישמר מיד, יחד עם שאר השינויים ברשימה.</DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <p className="text-[13px] font-medium">ה{terms.deals} בשלב הזה יעברו ל…</p>
            <Select value={moveTo} onValueChange={setMoveTo}>
              <SelectTrigger aria-label="השלב שאליו יעברו העסקאות">
                <SelectValue placeholder="בחר שלב" />
              </SelectTrigger>
              <SelectContent>
                {targets.map((t) => (
                  <SelectItem key={t.id} value={t.key!}>
                    {t.label.trim() || "שלב בלי שם"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRemoving(null)} disabled={pending}>
              ביטול
            </Button>
            <Button
              variant="destructive"
              disabled={pending || !moveTo}
              onClick={() => {
                const target = removing!;
                submit(
                  rows.filter((r) => r.id !== target.id),
                  moveTo,
                  () => {
                    setRows((list) => list.filter((r) => r.id !== target.id));
                    setRemoving(null);
                  },
                );
              }}
            >
              {pending && <CircleNotch className="animate-spin" />}
              הסר שלב
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StageRow({
  row,
  index,
  canManage,
  canRemove,
  onChange,
  onRemove,
}: {
  row: Row;
  index: number;
  canManage: boolean;
  canRemove: boolean;
  onChange: (label: string) => void;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: row.id,
    disabled: !canManage,
  });
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn("relative flex items-center gap-2 bg-module py-2", isDragging && "z-10 shadow-md")}
    >
      {canManage && (
        <button
          type="button"
          ref={setActivatorNodeRef}
          {...attributes}
          {...listeners}
          aria-label={`גרור כדי לשנות את המקום של "${row.label || "שלב חדש"}"`}
          className="grid size-7 shrink-0 cursor-grab place-items-center text-muted-foreground hover:text-foreground active:cursor-grabbing"
        >
          <DotsSixVertical className="size-4" />
        </button>
      )}
      <span className="num w-5 shrink-0 text-[11px] text-muted-foreground" aria-hidden>
        {String(index + 1).padStart(2, "0")}
      </span>
      <Input
        id={`stage-${row.id}`}
        dir="auto"
        value={row.label}
        maxLength={60}
        disabled={!canManage}
        placeholder="שם השלב"
        aria-label={`שם השלב ${index + 1}`}
        aria-invalid={!row.label.trim() || undefined}
        onChange={(e) => onChange(e.target.value)}
        className="h-8 min-w-0 flex-1 text-[13px]"
      />
      {row.kind === "won" && <Badge variant="positive">הצלחה</Badge>}
      {row.kind === "lost" && <Badge variant="outline">לא נסגר</Badge>}
      {row.kind === "open" && !row.key && <Badge variant="brand">חדש</Badge>}
      {canManage && row.kind === "open" && (
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onRemove}
          disabled={!canRemove}
          title={canRemove ? undefined : "צריך לפחות שלב פתוח אחד"}
          aria-label={`הסר את השלב "${row.label || "שלב חדש"}"`}
        >
          <Trash className="text-muted-foreground" />
        </Button>
      )}
      {canManage && row.kind !== "open" && <span className="size-8 shrink-0" aria-hidden />}
    </li>
  );
}
