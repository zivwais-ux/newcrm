"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Activity,
  BarChart3,
  Check,
  Handshake,
  Loader2,
  Plus,
  Radar,
  Repeat,
  ShieldAlert,
  Sparkles,
  TrendingDown,
  Upload,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { addComponent, addRecommendedComponents } from "@/lib/actions/components";
import { CATEGORY_LABELS, type ComponentCategory, type ComponentDefinition } from "@/lib/components/types";
import { ENTITY_SINGULAR } from "@/lib/components/registry";
import type { EntityName } from "@/types/domain";
import { cn } from "@/lib/utils";

export const COMPONENT_ICONS: Record<string, React.ElementType> = {
  "customer-hub": Users,
  "revenue-intelligence": BarChart3,
  "ai-analyst": Sparkles,
  "repeat-customers": Repeat,
  "customer-risk": TrendingDown,
  activities: Activity,
  "sales-pipeline": Handshake,
  "deal-risk": ShieldAlert,
  "followup-radar": Radar,
};

export interface StoreEntry {
  definition: Omit<ComponentDefinition, never>;
  installedId: string | null;
  recommended: boolean;
  reason: string;
  ready: boolean;
}

function ComponentCard({
  entry,
  canManage,
  onAdd,
  adding,
  highlight,
}: {
  entry: StoreEntry;
  canManage: boolean;
  onAdd: () => void;
  adding: boolean;
  highlight: boolean;
}) {
  const Icon = COMPONENT_ICONS[entry.definition.id] ?? Sparkles;
  return (
    <div
      id={`c-${entry.definition.id}`}
      className={cn(
        "flex flex-col rounded-lg border bg-surface p-4 transition-colors",
        highlight && "ring-2 ring-brand/40",
      )}
    >
      <div className="flex items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-md border bg-background text-zinc-600">
          <Icon className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">{entry.definition.name}</p>
          <p className="mt-0.5 text-[13px] text-muted-foreground">{entry.definition.description}</p>
        </div>
      </div>
      <div className="mt-4 flex items-center justify-between gap-2">
        <span className={cn("truncate text-xs", entry.ready ? "text-muted-foreground" : "text-warning")}>
          {entry.installedId ? "On your Home" : entry.reason}
        </span>
        {entry.installedId ? (
          <Button asChild size="xs" variant="ghost">
            <Link href={`/components/${entry.installedId}`}>
              <Check />
              Open
            </Link>
          </Button>
        ) : (
          canManage && (
            <Button size="xs" variant={entry.recommended ? "default" : "outline"} onClick={onAdd} disabled={adding}>
              {adding ? <Loader2 className="animate-spin" /> : <Plus />}
              Add
            </Button>
          )
        )}
      </div>
    </div>
  );
}

export function ComponentStore({
  entries,
  canManage,
  justImported,
  focus,
  counts,
}: {
  entries: StoreEntry[];
  canManage: boolean;
  justImported: boolean;
  focus: string | null;
  counts: Record<string, number>;
}) {
  const router = useRouter();
  const [addingId, setAddingId] = useState<string | null>(null);
  const [missing, setMissing] = useState<{ name: string; entities: EntityName[] } | null>(null);
  const [bulkPending, startBulk] = useTransition();
  const recommended = entries.filter((e) => e.recommended && !e.installedId);

  useEffect(() => {
    if (focus) document.getElementById(`c-${focus}`)?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [focus]);

  async function add(entry: StoreEntry) {
    setAddingId(entry.definition.id);
    const res = await addComponent(entry.definition.id);
    setAddingId(null);
    if (!res.ok) {
      if ("missing" in res) setMissing({ name: entry.definition.name, entities: res.missing });
      else toast.error(res.error);
      return;
    }
    toast.success(`${entry.definition.name} added to your workspace`, {
      action: { label: "Go to Home", onClick: () => router.push("/home") },
    });
    router.refresh();
  }

  function addAllRecommended() {
    startBulk(async () => {
      const res = await addRecommendedComponents();
      if (!res.ok) return void toast.error(res.error);
      toast.success(`Added ${res.data.added.length} Components`);
      router.push("/home");
      router.refresh();
    });
  }

  const categories = Object.keys(CATEGORY_LABELS) as ComponentCategory[];

  return (
    <div className="space-y-12">
      {justImported && (
        <div className="rounded-lg border bg-surface p-5">
          <p className="text-sm font-semibold">Your data is in.</p>
          <p className="mt-1 text-sm text-muted-foreground">
            We detected{" "}
            {(["customers", "transactions", "services", "leads", "deals", "activities"] as const)
              .filter((k) => counts[k])
              .map((k) => `${counts[k].toLocaleString()} ${k}`)
              .join(", ")}
            . Based on your business and your data, we recommend these Components.
          </p>
        </div>
      )}

      <section>
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold">Recommended for your business</h2>
            <p className="text-sm text-muted-foreground">Based on your business type and the data you have.</p>
          </div>
          {canManage && recommended.length > 1 && (
            <Button onClick={addAllRecommended} disabled={bulkPending}>
              {bulkPending ? <Loader2 className="animate-spin" /> : <Plus />}
              Add Recommended ({recommended.length})
            </Button>
          )}
        </div>
        {recommended.length ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {recommended.map((e) => (
              <ComponentCard
                key={e.definition.id}
                entry={e}
                canManage={canManage}
                onAdd={() => add(e)}
                adding={addingId === e.definition.id}
                highlight={focus === e.definition.id}
              />
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-start gap-3 rounded-lg border border-dashed p-5 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
            <span>
              {Object.values(counts).some(Boolean)
                ? "You've added everything we recommend. Browse all Components below."
                : "Import your business data and we'll recommend the right Components."}
            </span>
            {!Object.values(counts).some(Boolean) && (
              <Button asChild size="sm">
                <Link href="/data/import">
                  <Upload />
                  Import Data
                </Link>
              </Button>
            )}
          </div>
        )}
      </section>

      {categories.map((cat) => {
        const list = entries.filter((e) => e.definition.category === cat);
        if (!list.length) return null;
        return (
          <section key={cat}>
            <h2 className="mb-4 text-base font-semibold">{CATEGORY_LABELS[cat]}</h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {list.map((e) => (
                <ComponentCard
                  key={e.definition.id}
                  entry={e}
                  canManage={canManage}
                  onAdd={() => add(e)}
                  adding={addingId === e.definition.id}
                  highlight={focus === e.definition.id}
                />
              ))}
            </div>
          </section>
        );
      })}

      <Dialog open={!!missing} onOpenChange={(o) => !o && setMissing(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{missing?.name} needs more data</DialogTitle>
            <DialogDescription>
              This Component needs {missing?.entities.map((e) => ENTITY_SINGULAR[e]).join(" and ")} data. Import a file or add records, then
              add it again.
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
    </div>
  );
}
