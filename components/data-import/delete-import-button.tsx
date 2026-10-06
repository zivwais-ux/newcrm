"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { deleteImport, getImportImpact, type ImportImpact } from "@/lib/actions/import";
import { cn, formatNumber } from "@/lib/utils";

const IMPACT_LABELS: [keyof ImportImpact, string][] = [
  ["transactions", "מכירות"],
  ["activities", "תורים ופעילויות"],
  ["deals", "עסקאות"],
  ["leads", "פניות"],
  ["customers", "לקוחות שנוצרו מהקובץ"],
];

export function DeleteImportButton({ id, fileName }: { id: string; fileName: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [withData, setWithData] = useState(true);
  const [impact, setImpact] = useState<ImportImpact | null>(null);
  const [impactError, setImpactError] = useState(false);
  const [pending, start] = useTransition();

  useEffect(() => {
    if (!open || impact) return;
    let cancelled = false;
    getImportImpact(id).then((res) => {
      if (cancelled) return;
      if (res.ok) setImpact(res.data);
      else setImpactError(true);
    });
    return () => {
      cancelled = true;
    };
  }, [open, id, impact]);

  const confirm = () =>
    start(async () => {
      const res = await deleteImport(id, withData);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      const d = res.data;
      toast.success(
        withData
          ? `הקובץ נמחק, יחד עם ${formatNumber(d.transactions)} מכירות ו־${formatNumber(d.customers)} לקוחות.` +
              (d.customers_kept > 0 ? ` ${formatNumber(d.customers_kept)} לקוחות נשארו כי יש להם נתונים נוספים.` : "")
          : "הקובץ הוסר מהרשימה. הנתונים נשארו במערכת.",
      );
      setOpen(false);
      router.refresh();
    });

  const items = impact ? IMPACT_LABELS.filter(([k]) => impact[k] > 0) : [];

  return (
    <>
      <Button size="icon-sm" variant="ghost" aria-label={`מחק את ${fileName}`} title="מחק קובץ" onClick={() => setOpen(true)}>
        <Trash2 />
      </Button>
      <Dialog open={open} onOpenChange={(v) => !pending && setOpen(v)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>למחוק את הקובץ?</DialogTitle>
            <DialogDescription dir="auto">{fileName}</DialogDescription>
          </DialogHeader>

          <div className="grid gap-2" role="radiogroup" aria-label="מה למחוק">
            <Choice selected={withData} onSelect={() => setWithData(true)} title="מחק את הקובץ ואת כל הנתונים שיובאו ממנו">
              {impactError ? (
                <span>לא הצלחנו לחשב מה יימחק.</span>
              ) : !impact ? (
                <span className="inline-flex items-center gap-1.5">
                  <Loader2 className="size-3.5 animate-spin" /> בודקים מה יימחק…
                </span>
              ) : items.length ? (
                <span>
                  יימחקו: {items.map(([k, l]) => `${formatNumber(impact[k])} ${l}`).join(" · ")}.
                  {impact.customers > 0 && " לקוח שיש לו גם נתונים שהזנת ידנית יישאר."}
                </span>
              ) : (
                <span>אין נתונים שקשורים לקובץ הזה.</span>
              )}
            </Choice>
            <Choice selected={!withData} onSelect={() => setWithData(false)} title="רק הסר מהרשימה">
              הנתונים שיובאו נשארים בכלים שלך.
            </Choice>
          </div>
          {withData && <p className="text-xs font-medium text-negative">אי אפשר לבטל את המחיקה.</p>}

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              ביטול
            </Button>
            <Button variant="destructive" onClick={confirm} disabled={pending}>
              {pending ? <Loader2 className="animate-spin" /> : <Trash2 />}
              {withData ? "מחק קובץ ונתונים" : "הסר מהרשימה"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function Choice({ selected, onSelect, title, children }: { selected: boolean; onSelect: () => void; title: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={cn(
        "flex items-start gap-3 rounded-lg border p-3 text-start transition-colors",
        selected ? "border-brand bg-brand-soft/60" : "hover:bg-accent",
      )}
    >
      <span className={cn("mt-0.5 grid size-4 shrink-0 place-items-center rounded-full border", selected && "border-brand")}>
        {selected && <span className="size-2 rounded-full bg-brand" />}
      </span>
      <span>
        <span className="block text-sm font-semibold">{title}</span>
        <span className="block text-xs leading-relaxed text-muted-foreground">{children}</span>
      </span>
    </button>
  );
}
