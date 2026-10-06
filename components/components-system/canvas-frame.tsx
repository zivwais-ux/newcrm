"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ArrowClockwise, ArrowsHorizontal, ArrowsOut, ArrowsVertical, CircleNotch, DotsSixVertical, DotsThree, GearSix, LinkBreak, Plus, Trash } from "@phosphor-icons/react";
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
import { HEIGHTS, HEIGHT_LABELS, WIDTHS, WIDTH_LABELS, type ComponentHeight, type ComponentWidth, type ConfigField, type EmitKey, type FilterKey } from "@/lib/components/types";
import { cn } from "@/lib/utils";
import { ComponentConfigSheet } from "./component-config-sheet";
import { COMPONENT_ICONS } from "./component-store";

export interface CanvasItem {
  id: string;
  type: string;
  name: string;
  description: string;
  w: ComponentWidth;
  h?: ComponentHeight;
  config: Record<string, string>;
  configFields: ConfigField[];
  consumes: FilterKey[];
  emits?: EmitKey[];
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
  index,
  body,
  editable,
  activeFilters,
  onResize,
  onHeight,
  onRemove,
  highlighted = false,
}: {
  highlighted?: boolean;
  item: CanvasItem;
  /** 1-based position on the table, shown as the module's number. */
  index: number;
  body: React.ReactNode;
  editable: boolean;
  activeFilters: FilterKey[];
  onResize: (w: ComponentWidth) => void;
  onHeight: (h: ComponentHeight) => void;
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
  const h = item.h ?? "regular";
  const Icon = COMPONENT_ICONS[item.type];
  // Filters that are active on the canvas but that this Component doesn't react to.
  const unlinked = activeFilters.filter((f) => !item.consumes.includes(f));
  const filtered = activeFilters.some((f) => item.consumes.includes(f));
  const outs = (item.emits ?? []).filter((k): k is FilterKey => k !== "customer");

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
      style={{ transform: CSS.Translate.toString(transform), transition, animationDelay: `${Math.min(index, 12) * 45}ms` }}
      className={cn(
        "group/frame relative col-span-12 flex min-w-0 flex-col border border-border bg-module shadow-block transition-[box-shadow,border-color] duration-200",
        "animate-in fade-in-0 slide-in-from-bottom-2 fill-mode-both duration-500 motion-reduce:animate-none",
        "hover:border-border-strong",
        SPAN[w],
        h === "tall" && "lg:min-h-[34rem]",
        isDragging && "z-10 border-brand/50 opacity-70 shadow-xl",
        highlighted && "border-positive/60 animate-[bos-updated_1.2s_ease-out_2]",
        liveW && "border-brand/60",
      )}
      aria-label={item.name}
      data-module={item.type}
      data-updated={highlighted || undefined}
    >
      {/* Ports: where filters come in (start edge) and go out (end edge). Flow lines attach here. */}
      {item.consumes.length > 0 && (
        <span
          data-port="in"
          aria-hidden
          className={cn(
            "absolute top-[21px] -start-[5px] z-[1] hidden size-[9px] border bg-module lg:block",
            filtered ? "border-brand bg-brand" : "border-border-strong",
          )}
        />
      )}
      {outs.length > 0 && (
        <span
          data-port="out"
          aria-hidden
          className={cn(
            "absolute top-[21px] -end-[5px] z-[1] hidden size-[9px] border bg-module lg:block",
            activeFilters.some((f) => outs.includes(f)) ? "border-brand bg-brand" : "border-border-strong",
          )}
        />
      )}

      <header className="flex h-11 shrink-0 items-center gap-2 border-b border-border bg-rail ps-2 pe-1.5">
        {editable && !item.pending ? (
          <button
            ref={setActivatorNodeRef}
            {...listeners}
            {...attributes}
            className="grid h-7 w-5 cursor-grab place-items-center text-border-strong transition-colors hover:text-foreground active:cursor-grabbing"
            aria-label={`גרור את ${item.name}`}
          >
            <DotsSixVertical className="size-4" weight="bold" />
          </button>
        ) : (
          <span className="w-1" />
        )}
        <span className="num w-5 shrink-0 text-[11px] font-medium text-muted-foreground" aria-hidden>
          {String(index).padStart(2, "0")}
        </span>
        {Icon && <Icon className="size-[18px] shrink-0 text-brand" />}
        <h2 className="min-w-0 flex-1 truncate text-[14px] font-semibold tracking-tight">{item.name}</h2>
        {unlinked.length > 0 ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="inline-flex shrink-0 items-center gap-1 text-[11px] text-muted-foreground">
                <LinkBreak className="size-3.5" />
                <span className="hidden sm:inline">לא מסונן</span>
              </span>
            </TooltipTrigger>
            <TooltipContent>המודול הזה לא מגיב לסינון לפי {unlinked.map((f) => FILTER_NAMES[f]).join(" / ")}</TooltipContent>
          </Tooltip>
        ) : (
          !item.pending && (
            <span className="inline-flex shrink-0 items-center gap-1.5 text-[11px] text-muted-foreground" title={filtered ? "מסונן" : "מתעדכן לבד"}>
              <span className={cn("size-1.5 rounded-full", filtered ? "bg-brand" : "bg-positive")} />
              <span className="hidden sm:inline">{filtered ? "מסונן" : "חי"}</span>
            </span>
          )
        )}
        {!item.pending && (
          <Button asChild variant="ghost" size="icon-sm" className="size-7 text-muted-foreground" aria-label="פתח במסך מלא">
            <Link href={`/components/${item.id}`}>
              <ArrowsOut />
            </Link>
          </Button>
        )}
        {editable && !item.pending && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" className="size-7 text-muted-foreground" aria-label={`אפשרויות עבור ${item.name}`}>
                <DotsThree weight="bold" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem onSelect={() => setConfigOpen(true)}>
                <GearSix />
                הגדרות המודול
              </DropdownMenuItem>
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>
                  <ArrowsHorizontal className="size-4 text-muted-foreground" />
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
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>
                  <ArrowsVertical className="size-4 text-muted-foreground" />
                  גובה
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  <DropdownMenuRadioGroup value={h} onValueChange={(v) => onHeight(v as ComponentHeight)}>
                    {HEIGHTS.map((k) => (
                      <DropdownMenuRadioItem key={k} value={k}>
                        {HEIGHT_LABELS[k]}
                      </DropdownMenuRadioItem>
                    ))}
                  </DropdownMenuRadioGroup>
                </DropdownMenuSubContent>
              </DropdownMenuSub>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onSelect={() => setConfirmRemove(true)}>
                <Trash />
                הסר מהמסך
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </header>
      <div className="min-w-0 flex-1 p-4 sm:p-5">
        {item.pending ? <ModuleSkeleton /> : body}
      </div>

      {editable && !item.pending && (
        <div
          onPointerDown={startResize}
          className="absolute inset-y-12 -end-[7px] z-[2] hidden w-3 cursor-ew-resize items-center justify-center opacity-0 transition-opacity group-hover/frame:opacity-100 lg:flex"
          role="separator"
          aria-label={`שנה רוחב של ${item.name}`}
          title="גרור כדי לשנות רוחב"
        >
          <span className="h-12 w-[3px] bg-brand" />
        </div>
      )}
      {liveW && (
        <span className="num pointer-events-none absolute -top-3 start-1/2 z-[3] -translate-x-1/2 bg-brand px-2 py-0.5 text-[11px] font-medium text-white shadow-sm rtl:translate-x-1/2">
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
              המודול יוסר ממסך העבודה בלבד. הנתונים של העסק לא נמחקים, ותמיד אפשר להחזיר אותו מהמגירה.
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

/** Loading shape of a module body: a big number row and a block, like most modules. */
export function ModuleSkeleton() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-4">
        {[0, 1, 2].map((i) => (
          <div key={i} className="space-y-2">
            <Skeleton className="h-7 w-20" />
            <Skeleton className="h-3 w-14" />
          </div>
        ))}
      </div>
      <Skeleton className="h-28" />
    </div>
  );
}

/** Dashed drop indicator shown where a dragged Component will land. */
export function DropPlaceholder({ w, name, innerRef }: { w: ComponentWidth; name: string; innerRef?: (el: HTMLElement | null) => void }) {
  return (
    <div
      ref={innerRef}
      className={cn(
        "bos-drop-border col-span-12 flex min-h-44 items-center justify-center gap-2 bg-brand-soft/50 text-sm font-medium text-brand animate-in fade-in-0",
        SPAN[w],
      )}
    >
      <Plus className="size-4" />
      שחרר כאן כדי להוסיף את {name}
    </div>
  );
}

/** "Try again" for a Component whose data failed to load: re-renders the page's server data. */
export function RetryButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <Button size="sm" variant="outline" disabled={pending} onClick={() => startTransition(() => router.refresh())}>
      {pending ? <CircleNotch className="animate-spin" /> : <ArrowClockwise />}
      נסה שוב
    </Button>
  );
}
