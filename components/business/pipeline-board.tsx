"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  KeyboardSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { Plus } from "lucide-react";
import { RecordFormDialog } from "./record-form";
import { useWorkspace } from "@/components/layout/workspace-provider";
import { moveDeal } from "@/lib/actions/records";
import { cn, daysAgo, formatCurrency } from "@/lib/utils";
import { DEAL_STAGES, type Deal, type DealStage } from "@/types/domain";

export const STAGE_LABELS: Record<DealStage, string> = {
  new: "New",
  contacted: "Contacted",
  qualified: "Qualified",
  proposal: "Proposal",
  negotiation: "Negotiation",
  won: "Won",
  lost: "Lost",
};

function DealCard({ deal, onOpen, overlay = false }: { deal: Deal; onOpen?: () => void; overlay?: boolean }) {
  const { members, org } = useWorkspace();
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: deal.id, data: { stage: deal.stage } });
  const owner =
    (deal.custom_fields?.owner_name as string | undefined) ?? members.find((m) => m.user_id === deal.owner_id)?.full_name ?? null;
  const idle = daysAgo(deal.last_activity_at) ?? 0;
  const open = deal.stage !== "won" && deal.stage !== "lost";
  return (
    <div
      ref={overlay ? undefined : setNodeRef}
      {...(overlay ? {} : listeners)}
      {...(overlay ? {} : attributes)}
      onClick={onOpen}
      className={cn(
        "cursor-grab rounded-md border bg-surface p-2.5 text-left shadow-[0_1px_0_rgba(0,0,0,0.03)] transition-shadow hover:border-zinc-300 active:cursor-grabbing",
        isDragging && !overlay && "opacity-40",
        overlay && "rotate-1 shadow-lg",
      )}
    >
      <p className="line-clamp-2 text-[13px] leading-snug font-medium">{deal.name}</p>
      {deal.customers?.name && <p className="mt-0.5 truncate text-xs text-muted-foreground">{deal.customers.name}</p>}
      <div className="mt-2 flex items-center justify-between gap-2 text-xs">
        <span className="font-medium tabular">{formatCurrency(deal.value, org.currency)}</span>
        <span className={cn("truncate text-muted-foreground", open && idle >= 14 && "text-warning")}>
          {open ? (idle <= 0 ? "today" : `${idle}d idle`) : owner ?? ""}
        </span>
      </div>
      {open && owner && <p className="mt-1 truncate text-[11px] text-muted-foreground">{owner}</p>}
    </div>
  );
}

function Column({
  stage,
  deals,
  total,
  limit,
  onOpen,
  onAdd,
}: {
  stage: DealStage;
  deals: Deal[];
  total: number;
  limit?: number;
  onOpen: (d: Deal) => void;
  onAdd: () => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: stage });
  const { org } = useWorkspace();
  const visible = limit ? deals.slice(0, limit) : deals;
  return (
    <div className="flex w-60 shrink-0 flex-col">
      <div className="mb-2 flex items-baseline justify-between gap-2 px-0.5">
        <p className="text-[13px] font-medium">
          {STAGE_LABELS[stage]} <span className="font-normal text-muted-foreground tabular">{deals.length}</span>
        </p>
        <p className="text-xs text-muted-foreground tabular">{formatCurrency(total, org.currency, true)}</p>
      </div>
      <div
        ref={setNodeRef}
        className={cn(
          "flex min-h-24 flex-1 flex-col gap-2 rounded-md bg-muted/60 p-1.5 transition-colors",
          isOver && "bg-brand-soft ring-1 ring-brand/30",
        )}
      >
        {visible.map((d) => (
          <DealCard key={d.id} deal={d} onOpen={() => onOpen(d)} />
        ))}
        {limit && deals.length > limit && (
          <p className="px-1 py-0.5 text-xs text-muted-foreground">+{deals.length - limit} more</p>
        )}
        <button
          onClick={onAdd}
          className="flex items-center gap-1 rounded px-1.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-black/[0.04] hover:text-foreground cursor-pointer"
        >
          <Plus className="size-3.5" />
          Add deal
        </button>
      </div>
    </div>
  );
}

export function PipelineBoard({ deals: initial, limitPerColumn, focusDealId }: { deals: Deal[]; limitPerColumn?: number; focusDealId?: string | null }) {
  const router = useRouter();
  const [deals, setDeals] = useState(initial);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [editing, setEditing] = useState<Deal | null>(null);
  const [adding, setAdding] = useState<DealStage | null>(null);
  const boardId = useId();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(KeyboardSensor));

  useEffect(() => setDeals(initial), [initial]);
  useEffect(() => {
    if (focusDealId) setEditing(initial.find((d) => d.id === focusDealId) ?? null);
  }, [focusDealId, initial]);

  const byStage = useMemo(() => {
    const map = new Map<DealStage, Deal[]>(DEAL_STAGES.map((s) => [s, []]));
    for (const d of deals) map.get(d.stage)?.push(d);
    return map;
  }, [deals]);

  async function onDragEnd(e: DragEndEvent) {
    setActiveId(null);
    const id = String(e.active.id);
    const to = e.over?.id as DealStage | undefined;
    const deal = deals.find((d) => d.id === id);
    if (!deal || !to || deal.stage === to) return;
    const from = deal.stage;
    setDeals((ds) => ds.map((d) => (d.id === id ? { ...d, stage: to, last_activity_at: new Date().toISOString() } : d)));
    const res = await moveDeal(id, to);
    if (!res.ok) {
      toast.error(res.error);
      setDeals((ds) => ds.map((d) => (d.id === id ? { ...d, stage: from } : d)));
    } else {
      toast.success(`Moved to ${STAGE_LABELS[to]}`);
      router.refresh();
    }
  }

  const active = deals.find((d) => d.id === activeId);

  return (
    <>
      <DndContext id={boardId} sensors={sensors} onDragStart={(e) => setActiveId(String(e.active.id))} onDragEnd={onDragEnd} onDragCancel={() => setActiveId(null)}>
        <div className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-2">
          {DEAL_STAGES.map((stage) => {
            const list = byStage.get(stage) ?? [];
            return (
              <Column
                key={stage}
                stage={stage}
                deals={list}
                total={list.reduce((s, d) => s + Number(d.value), 0)}
                limit={limitPerColumn}
                onOpen={setEditing}
                onAdd={() => setAdding(stage)}
              />
            );
          })}
        </div>
        <DragOverlay>{active ? <DealCard deal={active} overlay /> : null}</DragOverlay>
      </DndContext>
      {editing && (
        <RecordFormDialog
          key={editing.id}
          entity="deals"
          open
          onOpenChange={(o) => !o && setEditing(null)}
          recordId={editing.id}
          initial={{
            name: editing.name,
            customer_id: editing.customer_id,
            value: editing.value,
            stage: editing.stage,
            expected_close: editing.expected_close,
            owner_id: editing.owner_id,
          }}
          labels={{ customer_id: editing.customers?.name ?? null }}
        />
      )}
      {adding && <RecordFormDialog entity="deals" open onOpenChange={(o) => !o && setAdding(null)} initial={{ stage: adding }} />}
    </>
  );
}
