"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Expand, GripVertical, Link2Off, Maximize2, MoreHorizontal, Plus, Settings2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { WIDTHS, WIDTH_LABELS, type ComponentWidth, type ConfigField, type FilterKey } from "@/lib/components/types";
import { cn } from "@/lib/utils";
import { ComponentConfigSheet } from "./component-config-sheet";
import { COMPONENT_ICONS } from "./component-store";

export interface CanvasItem {
  id: string;
  type: string;
  name: string;
  description: string;
  w: ComponentWidth;
  config: Record<string, string>;
  configFields: ConfigField[];
  consumes: FilterKey[];
  pending?: boolean;
}

const FILTER_NAMES: Record<FilterKey, string> = { range: "תאריכים", service: "שירות", stage: "שלב עסקה" };

// Static class names so Tailwind generates them.
export const SPAN: Record<ComponentWidth, string> = {
  "3": "lg:col-span-3",
  "4": "lg:col-span-4",
  "6": "lg:col-span-6",
  "8": "lg:col-span-8",
  "12": "lg:col-span-12",
};

function nearestWidth(cols: number): ComponentWidth {
  return WIDTHS.reduce((best, w) => (Math.abs(Number(w) - cols) < Math.abs(Number(best) - cols) ? w : best), WIDTHS[0]);
}

export function CanvasFrame({
  item,
  body,
  editable,
  activeFilters,
  onResize,
  onRemove,
}: {
  item: CanvasItem;
  body: React.ReactNode;
  editable: boolean;
  activeFilters: FilterKey[];
  onResize: (w: ComponentWidth) => void;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
    data: { kind: "item" },
    disabled: !editable || item.pending,
  });
  const frameRef = useRef<HTMLElement | null>(null);
  const [liveW, setLiveW] = useState<ComponentWidth | null>(null);
  const [configOpen, setConfigOpen] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const w = liveW ?? item.w;
  const Icon = COMPONENT_ICONS[item.type];
  // Filters that are active on the canvas but that this Component doesn't react to.
  const unlinked = activeFilters.filter((f) => !item.consumes.includes(f));

  function startResize(e: React.PointerEvent) {
    const frame = frameRef.current;
    const grid = frame?.parentElement;
    if (!frame || !grid) return;
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    // The handle sits on the end edge: in RTL that's the left side, so dragging left grows the card.
    const dir = getComputedStyle(frame).direction === "rtl" ? -1 : 1;
    const startWidth = frame.getBoundingClientRect().width;
    const colWidth = grid.getBoundingClientRect().width / 12;
    let next: ComponentWidth = item.w;
    const move = (ev: PointerEvent) => {
      next = nearestWidth((startWidth + (ev.clientX - startX) * dir) / colWidth);
      setLiveW(next);
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      setLiveW(null);
      if (next !== item.w) onResize(next);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  return (
    <section
      ref={(el) => {
        setNodeRef(el);
        frameRef.current = el;
      }}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn(
        "group/frame relative col-span-12 flex min-w-0 flex-col rounded-xl border bg-surface shadow-sm transition-shadow hover:shadow-md",
        SPAN[w],
        isDragging && "z-10 opacity-60 ring-2 ring-brand/30",
        liveW && "ring-2 ring-brand/40",
      )}
      aria-label={item.name}
    >
      <header className="flex items-center gap-2.5 border-b px-4 py-3">
        {editable && !item.pending && (
          <button
            ref={setActivatorNodeRef}
            {...listeners}
            {...attributes}
            className="-ms-1 cursor-grab rounded p-0.5 text-zinc-300 transition-colors hover:text-zinc-500 active:cursor-grabbing"
            aria-label={`גרור את ${item.name}`}
          >
            <GripVertical className="size-4" />
          </button>
        )}
        {Icon && (
          <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-brand-soft text-brand">
            <Icon className="size-3.5" />
          </span>
        )}
        <h2 className="min-w-0 flex-1 truncate text-[15px] font-semibold">{item.name}</h2>
        {unlinked.length > 0 && (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="inline-flex shrink-0 items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
                <Link2Off className="size-3" />
                לא מושפע מהסינון
              </span>
            </TooltipTrigger>
            <TooltipContent>הכלי הזה לא מגיב לסינון לפי {unlinked.map((f) => FILTER_NAMES[f]).join(" / ")}</TooltipContent>
          </Tooltip>
        )}
        {!item.pending && (
          <Button asChild variant="ghost" size="icon-sm" className="text-muted-foreground" aria-label="פתח במסך מלא">
            <Link href={`/components/${item.id}`}>
              <Expand />
            </Link>
          </Button>
        )}
        {editable && !item.pending && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" className="text-muted-foreground" aria-label={`אפשרויות עבור ${item.name}`}>
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem onSelect={() => setConfigOpen(true)}>
                <Settings2 />
                הגדרות הכלי
              </DropdownMenuItem>
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>
                  <Maximize2 className="size-4 text-muted-foreground" />
                  רוחב
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  <DropdownMenuRadioGroup value={item.w} onValueChange={(v) => onResize(v as ComponentWidth)}>
                    {WIDTHS.map((k) => (
                      <DropdownMenuRadioItem key={k} value={k}>
                        {WIDTH_LABELS[k]}
                      </DropdownMenuRadioItem>
                    ))}
                  </DropdownMenuRadioGroup>
                </DropdownMenuSubContent>
              </DropdownMenuSub>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onSelect={() => setConfirmRemove(true)}>
                <Trash2 />
                הסר מהמסך
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </header>
      <div className="min-w-0 flex-1 p-5">
        {item.pending ? (
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-4">
              <Skeleton className="h-12" />
              <Skeleton className="h-12" />
              <Skeleton className="h-12" />
            </div>
            <Skeleton className="h-24" />
          </div>
        ) : (
          body
        )}
      </div>

      {editable && !item.pending && (
        <div
          onPointerDown={startResize}
          className="absolute inset-y-3 -end-1.5 hidden w-3 cursor-ew-resize items-center justify-center opacity-0 transition-opacity group-hover/frame:opacity-100 lg:flex"
          role="separator"
          aria-label={`שנה רוחב של ${item.name}`}
          title="גרור כדי לשנות רוחב"
        >
          <span className="h-10 w-1 rounded-full bg-brand/50" />
        </div>
      )}
      {liveW && (
        <span className="pointer-events-none absolute -top-2.5 start-1/2 -translate-x-1/2 rtl:translate-x-1/2 rounded-md bg-brand px-2 py-0.5 text-[11px] font-medium text-white shadow-sm">
          {WIDTH_LABELS[liveW]}
        </span>
      )}

      {configOpen && (
        <ComponentConfigSheet open onOpenChange={setConfigOpen} instanceId={item.id} name={item.name} fields={item.configFields} config={item.config} />
      )}
      <AlertDialog open={confirmRemove} onOpenChange={setConfirmRemove}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>להסיר את &quot;{item.name}&quot; מהמסך?</AlertDialogTitle>
            <AlertDialogDescription>
              הכלי יוסר ממסך העבודה בלבד. הנתונים של העסק לא נמחקים, ותמיד אפשר לגרור אותו בחזרה.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>ביטול</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={onRemove}>
              הסר
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}

/** Dashed drop indicator shown where a dragged Component will land. */
export function DropPlaceholder({ w, name, innerRef }: { w: ComponentWidth; name: string; innerRef?: (el: HTMLElement | null) => void }) {
  return (
    <div
      ref={innerRef}
      className={cn(
        "bos-drop-border col-span-12 flex min-h-40 items-center justify-center gap-2 rounded-xl bg-brand-soft/60 text-sm font-medium text-brand animate-in fade-in-0",
        SPAN[w],
      )}
    >
      <Plus className="size-4" />
      שחרר כאן כדי להוסיף את {name}
    </div>
  );
}
