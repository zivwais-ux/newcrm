"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ChartLineUp,
  Check,
  CircleNotch,
  Crosshair,
  Handshake,
  ListChecks,
  PaperPlaneTilt,
  Plus,
  Pulse,
  Repeat,
  ShieldWarning,
  Sparkle,
  SunHorizon,
  TrendDown,
  UploadSimple,
  Users,
} from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { addComponent, addRecommendedComponents } from "@/lib/actions/components";
import { CATEGORY_LABELS, type ComponentCategory, type ComponentDefinition } from "@/lib/components/types";
import { entitiesText } from "@/lib/components/registry";
import type { EntityName } from "@/types/domain";
import { cn, formatNumber } from "@/lib/utils";

export const COMPONENT_ICONS: Record<string, React.ElementType> = {
  "customer-hub": Users,
  "revenue-intelligence": ChartLineUp,
  "ai-analyst": Sparkle,
  "repeat-customers": Repeat,
  "customer-risk": TrendDown,
  activities: Pulse,
  "sales-pipeline": Handshake,
  "deal-risk": ShieldWarning,
  "followup-radar": Crosshair,
  tasks: ListChecks,
  today: SunHorizon,
  outbox: PaperPlaneTilt,
};

const ENTITY_COUNT_LABELS: Record<string, string> = {
  customers: "לקוחות",
  transactions: "מכירות",
  services: "שירותים",
  leads: "פניות",
  deals: "עסקאות",
  activities: "פעילויות",
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
  const Icon = COMPONENT_ICONS[entry.definition.id] ?? Sparkle;
  return (
    <div
      id={`c-${entry.definition.id}`}
      className={cn(
        "flex flex-col rounded-xl border bg-surface p-5 shadow-xs transition-[box-shadow,transform] duration-150 hover:-translate-y-0.5 hover:shadow-md",
        highlight && "ring-2 ring-brand/40",
      )}
    >
      <div className="flex items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-brand-soft text-brand">
          <Icon className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-semibold">{entry.definition.name}</p>
          <p className="mt-0.5 text-[13px] text-muted-foreground">{entry.definition.description}</p>
        </div>
      </div>
      <div className="mt-4 flex items-center justify-between gap-2">
        <span className={cn("truncate text-xs", entry.ready ? "text-muted-foreground" : "text-warning")}>
          {entry.installedId ? "כבר במסך" : entry.reason}
        </span>
        {entry.installedId ? (
          <Button asChild size="xs" variant="ghost">
            <Link href={`/components/${entry.installedId}`}>
              <Check />
              פתח
            </Link>
          </Button>
        ) : (
          canManage && (
            <Button size="xs" variant={entry.recommended ? "default" : "outline"} onClick={onAdd} disabled={adding}>
              {adding ? <CircleNotch className="animate-spin" /> : <Plus />}
              הוסף למסך
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
    toast.success(`"${entry.definition.name}" נוסף למסך העבודה`, {
      action: { label: "למסך הבית", onClick: () => router.push("/home") },
    });
    router.refresh();
  }

  function addAllRecommended() {
    startBulk(async () => {
      const res = await addRecommendedComponents();
      if (!res.ok) return void toast.error(res.error);
      toast.success(res.data.added.length === 1 ? "נוסף כלי אחד למסך" : `נוספו ${formatNumber(res.data.added.length)} כלים למסך`);
      router.push("/home");
      router.refresh();
    });
  }

  const categories = Object.keys(CATEGORY_LABELS) as ComponentCategory[];

  return (
    <div className="space-y-12">
      {justImported && (
        <div className="rounded-xl border border-brand/20 bg-brand-soft/50 p-5 shadow-xs">
          <p className="text-[15px] font-semibold">הנתונים שלך עלו בהצלחה.</p>
          <p className="mt-1 text-sm text-muted-foreground">
            מצאנו{" "}
            {(["customers", "transactions", "services", "leads", "deals", "activities"] as const)
              .filter((k) => counts[k])
              .map((k) => `${formatNumber(counts[k])} ${ENTITY_COUNT_LABELS[k]}`)
              .join(", ")}
            . לפי סוג העסק והנתונים, אלה הכלים שאנחנו ממליצים עליהם.
          </p>
        </div>
      )}

      <section>
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold">מומלץ לעסק שלך</h2>
            <p className="text-sm text-muted-foreground">לפי סוג העסק והנתונים שכבר יש לך.</p>
          </div>
          {canManage && recommended.length > 1 && (
            <Button onClick={addAllRecommended} disabled={bulkPending}>
              {bulkPending ? <CircleNotch className="animate-spin" /> : <Plus />}
              הוסף את כל המומלצים ({formatNumber(recommended.length)})
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
          <div className="flex flex-col items-start gap-3 rounded-xl border border-dashed p-5 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
            <span>
              {Object.values(counts).some(Boolean)
                ? "הוספת את כל מה שהמלצנו עליו. אפשר לעיין בכל הכלים למטה."
                : "העלה את נתוני העסק, ונמליץ לך על הכלים המתאימים."}
            </span>
            {!Object.values(counts).some(Boolean) && (
              <Button asChild size="sm">
                <Link href="/data/import">
                  <UploadSimple />
                  העלה קובץ
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
            <DialogTitle>לכלי &quot;{missing?.name}&quot; חסרים נתונים</DialogTitle>
            <DialogDescription>
              הכלי הזה צריך {missing ? entitiesText(missing.entities) : ""}. העלה קובץ או הוסף רשומות, ואז הוסף אותו שוב.
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
    </div>
  );
}
