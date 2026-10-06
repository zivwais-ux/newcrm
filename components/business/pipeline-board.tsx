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
import { PartyPopper, Plus } from "lucide-react";
import { RecordFormDialog } from "./record-form";
import { WhatsAppButton } from "./whatsapp-button";
import { useWorkspace } from "@/components/layout/workspace-provider";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { moveDeal } from "@/lib/actions/records";
import { israelToday } from "@/lib/analytics/dates";
import { cn, daysAgo, formatCurrency, formatNumber, plural } from "@/lib/utils";
import { Ltr } from "@/components/ui/ltr";
import { DEAL_STAGES, type Deal, type DealStage } from "@/types/domain";
import { STAGE_LABELS } from "./labels";

export { STAGE_LABELS };

/** Per-stage totals computed in SQL (pipeline_summary RPC). */
export interface StageTotals {
  stage: string;
  deals: number;
  value: number;
}

/** Stops clicks/drags inside a card control (and its portaled dialog) from opening or dragging the card. */
function stopAll(e: React.SyntheticEvent) {
  e.stopPropagation();
}

function DealCard({ deal, onOpen, overlay = false }: { deal: Deal; onOpen?: () => void; overlay?: boolean }) {
  const { members, org } = useWorkspace();
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: deal.id, data: { stage: deal.stage } });
  const owner =
    (deal.custom_fields?.owner_name as string | undefined) ?? members.find((m) => m.user_id === deal.owner_id)?.full_name ?? null;
  const idle = daysAgo(deal.last_activity_at) ?? 0;
  const open = deal.stage !== "won" && deal.stage !== "lost";
  const phone = deal.customers?.phone;
  return (
    <div
      ref={overlay ? undefined : setNodeRef}
      {...(overlay ? {} : listeners)}
      {...(overlay ? {} : attributes)}
      onClick={onOpen}
      className={cn(
        "cursor-grab rounded-lg border bg-surface p-3 text-start shadow-xs transition-all hover:-translate-y-px hover:shadow-sm active:cursor-grabbing",
        isDragging && !overlay && "opacity-40",
        overlay && "rotate-1 shadow-lg",
      )}
    >
      <div className="flex items-start gap-1">
        <div className="min-w-0 flex-1">
          <p className="line-clamp-2 text-[13px] leading-snug font-medium">{deal.name}</p>
          {deal.customers?.name && <p className="mt-0.5 truncate text-xs text-muted-foreground">{deal.customers.name}</p>}
        </div>
        {phone && deal.customers?.name && !overlay && (
          <span className="-me-1.5 -mt-1 shrink-0" onClick={stopAll} onPointerDown={stopAll} onKeyDown={stopAll}>
            <WhatsAppButton phone={phone} name={deal.customers.name} customerId={deal.customer_id} dealId={deal.id} />
          </span>
        )}
      </div>
      <div className="mt-2 flex items-center justify-between gap-2 text-xs">
        <Ltr className="font-semibold tabular">{formatCurrency(deal.value, org.currency)}</Ltr>
        <span className={cn("truncate text-muted-foreground", open && idle >= 14 && "text-warning")}>
          {open ? (idle <= 0 ? "עודכנה היום" : `${plural(idle, "יום", "ימים")} בלי תזוזה`) : owner ?? ""}
        </span>
      </div>
      {open && owner && <p className="mt-1 truncate text-[11px] text-muted-foreground">{owner}</p>}
    </div>
  );
}

function Column({
  stage,
  deals,
  count,
  total,
  limit,
  onOpen,
  onAdd,
  selected,
  collapsed,
  onHeaderClick,
}: {
  stage: DealStage;
  deals: Deal[];
  count: number;
  total: number;
  limit?: number;
  onOpen: (d: Deal) => void;
  onAdd: () => void;
  selected?: boolean;
  collapsed?: boolean;
  onHeaderClick?: () => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: stage });
  const { org } = useWorkspace();
  const visible = collapsed ? [] : limit ? deals.slice(0, limit) : deals;
  const hidden = Math.max(0, count - visible.length);
  return (
    <div className={cn("flex shrink-0 flex-col", collapsed ? "w-28" : selected ? "w-72" : "w-60")}>
      <button
        type="button"
        onClick={onHeaderClick}
        disabled={!onHeaderClick}
        aria-pressed={selected}
        title={onHeaderClick ? (selected ? "לחץ כדי לבטל את הסינון לפי השלב" : "לחץ כדי להציג רק את העסקאות בשלב הזה") : undefined}
        className={cn(
          "mb-2 flex gap-x-2 rounded-md px-1.5 py-0.5 text-start enabled:cursor-pointer enabled:hover:bg-muted/70",
          collapsed ? "flex-col items-start" : "items-baseline justify-between",
          selected && "bg-brand-soft text-brand enabled:hover:bg-brand-soft",
        )}
      >
        <span className={cn("text-[13px] font-medium", collapsed && "text-muted-foreground")}>
          {STAGE_LABELS[stage]} <span className="font-normal text-muted-foreground tabular">{formatNumber(count)}</span>
        </span>
        <Ltr className="text-xs text-muted-foreground tabular">{formatCurrency(total, org.currency, true)}</Ltr>
      </button>
      <div
        ref={setNodeRef}
        className={cn(
          "flex min-h-24 flex-1 flex-col gap-2 rounded-xl bg-muted/60 p-2 transition-colors",
          collapsed && "bg-muted/30",
          isOver && "bg-brand-soft ring-1 ring-brand/30",
        )}
      >
        {visible.map((d) => (
          <DealCard key={d.id} deal={d} onOpen={() => onOpen(d)} />
        ))}
        {collapsed ? (
          <p className="px-1 py-0.5 text-[11px] leading-snug text-muted-foreground">גרור לכאן כדי להעביר</p>
        ) : (
          <>
            {hidden > 0 && <p className="px-1 py-0.5 text-xs text-muted-foreground">ועוד {formatNumber(hidden)}</p>}
            <button
              onClick={onAdd}
              className="flex items-center gap-1 rounded-sm px-1.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-black/[0.04] hover:text-foreground cursor-pointer"
            >
              <Plus className="size-3.5" />
              הוסף עסקה
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export function PipelineBoard({
  deals: initial,
  summary: initialSummary,
  limitPerColumn,
  focusDealId,
  selectedStage,
  onStageClick,
}: {
  deals: Deal[];
  /** SQL totals per stage. When given, column counts/sums come from here instead of the loaded deals. */
  summary?: StageTotals[];
  limitPerColumn?: number;
  focusDealId?: string | null;
  /** When set, only this stage's deals are shown; other stages stay as narrow drop targets. */
  selectedStage?: DealStage | null;
  onStageClick?: (stage: DealStage) => void;
}) {
  const router = useRouter();
  const { org } = useWorkspace();
  const [deals, setDeals] = useState(initial);
  const [summary, setSummary] = useState(initialSummary);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [editing, setEditing] = useState<Deal | null>(null);
  const [adding, setAdding] = useState<DealStage | null>(null);
  const [wonDeal, setWonDeal] = useState<Deal | null>(null);
  const [saleFor, setSaleFor] = useState<Deal | null>(null);
  const boardId = useId();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(KeyboardSensor));

  useEffect(() => setDeals(initial), [initial]);
  useEffect(() => setSummary(initialSummary), [initialSummary]);
  useEffect(() => {
    if (focusDealId) setEditing(initial.find((d) => d.id === focusDealId) ?? null);
  }, [focusDealId, initial]);

  const byStage = useMemo(() => {
    const map = new Map<DealStage, Deal[]>(DEAL_STAGES.map((s) => [s, []]));
    for (const d of deals) map.get(d.stage)?.push(d);
    return map;
  }, [deals]);

  /** Moves one deal's count/value between stages in the local SQL totals (optimistic). */
  function shiftTotals(from: DealStage, to: DealStage, value: number) {
    setSummary((s) =>
      s?.map((x) =>
        x.stage === from
          ? { ...x, deals: Math.max(0, x.deals - 1), value: x.value - value }
          : x.stage === to
            ? { ...x, deals: x.deals + 1, value: x.value + value }
            : x,
      ),
    );
  }

  async function onDragEnd(e: DragEndEvent) {
    setActiveId(null);
    const id = String(e.active.id);
    const to = e.over?.id as DealStage | undefined;
    const deal = deals.find((d) => d.id === id);
    if (!deal || !to || deal.stage === to) return;
    const from = deal.stage;
    const value = Number(deal.value);
    setDeals((ds) => ds.map((d) => (d.id === id ? { ...d, stage: to, last_activity_at: new Date().toISOString() } : d)));
    shiftTotals(from, to, value);
    const res = await moveDeal(id, to);
    if (!res.ok) {
      toast.error(res.error);
      setDeals((ds) => ds.map((d) => (d.id === id ? { ...d, stage: from } : d)));
      shiftTotals(to, from, value);
      return;
    }
    if (to === "won") setWonDeal({ ...deal, stage: to });
    else toast.success(`הועברה לשלב "${STAGE_LABELS[to]}"`);
    router.refresh();
  }

  const active = deals.find((d) => d.id === activeId);
  const totalsFor = (stage: DealStage, list: Deal[]) => {
    const s = summary?.find((x) => x.stage === stage);
    return s ? { count: s.deals, total: s.value } : { count: list.length, total: list.reduce((sum, d) => sum + Number(d.value), 0) };
  };

  return (
    <>
      <DndContext id={boardId} sensors={sensors} onDragStart={(e) => setActiveId(String(e.active.id))} onDragEnd={onDragEnd} onDragCancel={() => setActiveId(null)}>
        <div className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-2">
          {DEAL_STAGES.map((stage) => {
            const list = byStage.get(stage) ?? [];
            const { count, total } = totalsFor(stage, list);
            const collapsed = Boolean(selectedStage) && selectedStage !== stage;
            return (
              <Column
                key={stage}
                stage={stage}
                deals={list}
                count={count}
                total={total}
                limit={selectedStage === stage ? undefined : limitPerColumn}
                onOpen={setEditing}
                onAdd={() => setAdding(stage)}
                selected={selectedStage === stage}
                collapsed={collapsed}
                onHeaderClick={onStageClick ? () => onStageClick(stage) : undefined}
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

      <Dialog open={Boolean(wonDeal)} onOpenChange={(o) => !o && setWonDeal(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <PartyPopper className="size-5 text-positive" />
              העסקה נסגרה בהצלחה!
            </DialogTitle>
            <DialogDescription>
              לרשום מכירה?{" "}
              {wonDeal && (
                <>
                  <Ltr>{formatCurrency(Number(wonDeal.value), org.currency)}</Ltr>
                  {wonDeal.customers?.name ? ` מ${wonDeal.customers.name}` : ""} — כך היא תיכנס להכנסות.
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setWonDeal(null)}>
              לא עכשיו
            </Button>
            <Button
              onClick={() => {
                setSaleFor(wonDeal);
                setWonDeal(null);
              }}
            >
              רשום מכירה
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {saleFor && (
        <RecordFormDialog
          key={`sale-${saleFor.id}`}
          entity="transactions"
          open
          onOpenChange={(o) => !o && setSaleFor(null)}
          initial={{
            customer_id: saleFor.customer_id,
            amount: Number(saleFor.value) || null,
            date: israelToday(),
            type: "sale",
            status: "paid",
          }}
          labels={{ customer_id: saleFor.customers?.name ?? null }}
        />
      )}
    </>
  );
}
