"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, rectSortingStrategy, sortableKeyboardCoordinates, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Expand, GripVertical, MoreHorizontal, Settings2, Trash2, Maximize2 } from "lucide-react";
import { Button } from "@/components/ui/button";
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
import { removeComponent, reorderComponents, updateComponentConfig } from "@/lib/actions/components";
import { SIZE_LABELS, type ComponentSize, type ConfigField } from "@/lib/components/types";
import { cn } from "@/lib/utils";
import { ComponentConfigSheet } from "./component-config-sheet";

export interface GridItem {
  id: string;
  type: string;
  name: string;
  description: string;
  size: ComponentSize;
  config: Record<string, string>;
  configFields: ConfigField[];
}

const SPAN: Record<ComponentSize, string> = {
  sm: "lg:col-span-4",
  md: "lg:col-span-6",
  lg: "lg:col-span-12",
};

function Frame({
  item,
  body,
  canManage,
  onResize,
  onRemove,
}: {
  item: GridItem;
  body: React.ReactNode;
  canManage: boolean;
  onResize: (size: ComponentSize) => void;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: item.id });
  const [configOpen, setConfigOpen] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);

  return (
    <section
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn(
        "group/frame col-span-12 flex min-w-0 flex-col rounded-lg border bg-surface",
        SPAN[item.size],
        isDragging && "z-10 shadow-xl ring-1 ring-brand/20",
      )}
      aria-label={item.name}
    >
      <header className="flex items-center gap-2 border-b px-4 py-3">
        {canManage && (
          <button
            ref={setActivatorNodeRef}
            {...listeners}
            {...attributes}
            className="-ml-1.5 cursor-grab rounded p-0.5 text-zinc-300 transition-colors hover:text-zinc-500 active:cursor-grabbing"
            aria-label={`Drag ${item.name}`}
          >
            <GripVertical className="size-4" />
          </button>
        )}
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-sm font-semibold">{item.name}</h2>
        </div>
        <Button asChild variant="ghost" size="icon-sm" className="text-muted-foreground" aria-label="Open full view">
          <Link href={`/components/${item.id}`}>
            <Expand />
          </Link>
        </Button>
        {canManage && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" className="text-muted-foreground" aria-label={`${item.name} options`}>
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem onSelect={() => setConfigOpen(true)}>
                <Settings2 />
                Configure
              </DropdownMenuItem>
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>
                  <Maximize2 className="size-4 text-muted-foreground" />
                  Resize
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  <DropdownMenuRadioGroup value={item.size} onValueChange={(v) => onResize(v as ComponentSize)}>
                    {Object.entries(SIZE_LABELS).map(([k, label]) => (
                      <DropdownMenuRadioItem key={k} value={k}>
                        {label}
                      </DropdownMenuRadioItem>
                    ))}
                  </DropdownMenuRadioGroup>
                </DropdownMenuSubContent>
              </DropdownMenuSub>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onSelect={() => setConfirmRemove(true)}>
                <Trash2 />
                Remove from Home
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </header>
      <div className="min-w-0 flex-1 p-4">{body}</div>

      {configOpen && (
        <ComponentConfigSheet
          open
          onOpenChange={setConfigOpen}
          instanceId={item.id}
          name={item.name}
          fields={item.configFields}
          config={item.config}
        />
      )}
      <AlertDialog open={confirmRemove} onOpenChange={setConfirmRemove}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {item.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              The Component is removed from your workspace. Your business data is not affected, and you can add it again any time.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={onRemove}>
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}

export function WorkspaceGrid({ items: initial, bodies, canManage }: { items: GridItem[]; bodies: Record<string, React.ReactNode>; canManage: boolean }) {
  const router = useRouter();
  const [items, setItems] = useState(initial);
  const [, startTransition] = useTransition();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  useEffect(() => setItems(initial), [initial]);

  function onDragEnd(e: DragEndEvent) {
    if (!e.over || e.active.id === e.over.id) return;
    const from = items.findIndex((i) => i.id === e.active.id);
    const to = items.findIndex((i) => i.id === e.over!.id);
    const next = arrayMove(items, from, to);
    const previous = items;
    setItems(next);
    startTransition(async () => {
      const res = await reorderComponents(next.map((i) => i.id));
      if (!res.ok) {
        toast.error(res.error);
        setItems(previous);
      }
    });
  }

  function resize(id: string, size: ComponentSize) {
    const previous = items;
    setItems((list) => list.map((i) => (i.id === id ? { ...i, size } : i)));
    startTransition(async () => {
      const res = await updateComponentConfig(id, { size });
      if (!res.ok) {
        toast.error(res.error);
        setItems(previous);
      }
    });
  }

  function remove(id: string) {
    const previous = items;
    setItems((list) => list.filter((i) => i.id !== id));
    startTransition(async () => {
      const res = await removeComponent(id);
      if (!res.ok) {
        toast.error(res.error);
        setItems(previous);
      } else {
        toast.success("Component removed");
        router.refresh();
      }
    });
  }

  return (
    <DndContext id="workspace-grid" sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <SortableContext items={items.map((i) => i.id)} strategy={rectSortingStrategy}>
        <div className="grid grid-cols-12 gap-4">
          {items.map((item) => (
            <Frame
              key={item.id}
              item={item}
              body={bodies[item.id]}
              canManage={canManage}
              onResize={(size) => resize(item.id, size)}
              onRemove={() => remove(item.id)}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}
