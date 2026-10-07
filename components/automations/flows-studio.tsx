"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowUUpLeft,
  BellRinging,
  Cake,
  CalendarDots,
  CircleNotch,
  ClockCountdown,
  CookingPot,
  DotsThree,
  FlowArrow,
  Handshake,
  HourglassMedium,
  Lightning,
  PencilSimple,
  Plus,
  Receipt,
  Trash,
  UserPlus,
} from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Module, ModuleRail } from "@/components/ui/module";
import { EmptyState } from "@/components/ui/empty-state";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useFields, useTerms } from "@/components/layout/workspace-provider";
import { archiveAutomation, enableRecipe, setAutomationEnabled, type AutomationRow, type RunRow } from "@/lib/actions/automations";
import { describeAutomation } from "@/lib/automations/describe";
import { RECIPES, type Recipe } from "@/lib/automations/recipes";
import { cn, formatNumber } from "@/lib/utils";
import { Switch } from "./switch";
import { FlowSentence, RelTime } from "./flow-sentence";
import { RunList } from "./run-list";
import { useDescribeContext } from "./flow-vocab";

const RECIPE_ICONS: Record<string, React.ElementType> = {
  thank_first_purchase: Receipt,
  win_back: ArrowUUpLeft,
  appointment_reminder: CalendarDots,
  new_lead_followup: UserPlus,
  stuck_deal: HourglassMedium,
  pending_payment: BellRinging,
  won_deal: Handshake,
  birthday: Cake,
};

/** "זרימות": the business's flows, ready-made recipes, and what happened lately. */
export function FlowsStudio({ flows, runs, canManage }: { flows: AutomationRow[]; runs: RunRow[]; canManage: boolean }) {
  const used = new Set(flows.map((f) => f.recipe_key).filter(Boolean));
  const recipes = RECIPES.filter((r) => !used.has(r.key));

  return (
    <div className="space-y-10">
      <section aria-labelledby="flows-heading" className="space-y-3">
        <h2 id="flows-heading" className="sr-only">
          הזרימות שלי
        </h2>
        <div className="dot-grid grain border border-border bg-table p-3 sm:p-5">
          {flows.length ? (
            <ul className="space-y-3">
              {flows.map((f, i) => (
                <li key={f.id}>
                  <FlowRow flow={f} index={i + 1} canManage={canManage} />
                </li>
              ))}
            </ul>
          ) : (
            <Module>
              <EmptyState
                icon={<FlowArrow />}
                title="עוד אין זרימות"
                description={
                  canManage
                    ? "זרימה עושה עבורך עבודה קטנה שחוזרת על עצמה. התחל ממתכון מוכן למטה, או בנה אחת משלך."
                    : "כשבעלי העסק יוסיפו זרימות, הן יופיעו כאן."
                }
                action={
                  canManage ? (
                    <Button asChild variant="brand" size="sm">
                      <Link href="/automations/new">
                        <Plus />
                        זרימה חדשה
                      </Link>
                    </Button>
                  ) : undefined
                }
              />
            </Module>
          )}
        </div>
      </section>

      {canManage && recipes.length > 0 && (
        <section id="recipes" aria-labelledby="recipes-heading" className="space-y-4">
          <div className="space-y-1">
            <h2 id="recipes-heading" className="text-lg font-semibold tracking-tight">
              מתכונים מוכנים
            </h2>
            <p className="text-[13px] text-muted-foreground">זרימות שעובדות לרוב העסקים. לחיצה אחת מפעילה, ואפשר להתאים אחר כך.</p>
          </div>
          <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {recipes.map((r) => (
              <li key={r.key} className="flex">
                <RecipeCard recipe={r} />
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="runs-heading">
        <Module>
          <ModuleRail icon={<ClockCountdown />} title={<span id="runs-heading">מה קרה לאחרונה</span>} meta={runs.length ? <span className="num">{formatNumber(runs.length)}</span> : undefined} />
          {runs.length ? (
            <RunList runs={runs} limit={20} />
          ) : (
            <EmptyState
              compact
              icon={<ClockCountdown />}
              title="עוד לא קרה כלום"
              description="כל פעם שזרימה עושה משהו — מכינה הודעה, יוצרת משימה — זה יופיע כאן."
              action={
                canManage && !flows.some((f) => f.enabled) ? (
                  <Button asChild variant="outline" size="sm">
                    <a href={recipes.length ? "#recipes" : "/automations/new"}>{recipes.length ? "הפעל מתכון מוכן" : "זרימה חדשה"}</a>
                  </Button>
                ) : undefined
              }
            />
          )}
        </Module>
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------

function FlowRow({ flow, index, canManage }: { flow: AutomationRow; index: number; canManage: boolean }) {
  const router = useRouter();
  const ctx = useDescribeContext();
  const [enabled, setEnabled] = useState(flow.enabled);
  const [confirm, setConfirm] = useState(false);
  const [pending, start] = useTransition();
  const sentence = useMemo(() => describeAutomation(flow, ctx), [flow, ctx]);
  const href = `/automations/${flow.id}`;

  function toggle(next: boolean) {
    setEnabled(next);
    start(async () => {
      const res = await setAutomationEnabled(flow.id, next);
      if (!res.ok) {
        setEnabled(!next);
        toast.error(res.error);
      }
    });
  }

  function remove() {
    start(async () => {
      const res = await archiveAutomation(flow.id);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("הזרימה הוסרה");
      setConfirm(false);
      router.refresh();
    });
  }

  return (
    <Module className={cn("transition-[border-color,opacity] hover:border-border-strong", !enabled && "bg-module/90")}>
      <ModuleRail
        index={index}
        icon={<Lightning weight={enabled ? "fill" : "regular"} className={cn(!enabled && "text-muted-foreground")} />}
        title={
          <Link href={href} className="hover:text-brand">
            {flow.name}
          </Link>
        }
        meta={
          <span className="inline-flex items-center gap-1.5">
            <span className={cn("size-1.5 rounded-full", enabled ? "bg-positive" : "bg-border-strong")} aria-hidden />
            {enabled ? "פועלת" : "כבויה"}
          </span>
        }
        actions={
          canManage ? (
            <>
              <Switch checked={enabled} onCheckedChange={toggle} disabled={pending} aria-label={`${flow.name}: ${enabled ? "פועלת" : "כבויה"}`} />
              <DropdownMenu dir="rtl">
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon-sm" aria-label="עוד פעולות" className="ms-1 text-muted-foreground">
                    <DotsThree weight="bold" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onSelect={() => router.push(href)}>
                    <PencilSimple />
                    ערוך
                  </DropdownMenuItem>
                  <DropdownMenuItem variant="destructive" onSelect={() => setConfirm(true)}>
                    <Trash />
                    הסר
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          ) : undefined
        }
      />
      <Link href={href} className="group block px-4 py-3.5 sm:px-5" aria-label={`פתח את ${flow.name}`}>
        <FlowSentence text={sentence} className={cn("text-[14.5px] transition-colors", enabled ? "text-foreground" : "text-muted-foreground", "group-hover:text-foreground")} />
        <p className="mt-2 text-xs text-muted-foreground">
          {flow.runs_count > 0 ? (
            <>
              הופעלה <span className="num">{formatNumber(flow.runs_count)}</span> {flow.runs_count === 1 ? "פעם" : "פעמים"}
              {flow.last_run_at && (
                <>
                  {" · לאחרונה "}
                  <RelTime value={flow.last_run_at} />
                </>
              )}
            </>
          ) : enabled ? (
            "עוד לא הופעלה. היא תפעל ברגע שזה יקרה."
          ) : (
            "עוד לא הופעלה"
          )}
        </p>
      </Link>

      <AlertDialog open={confirm} onOpenChange={setConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>להסיר את &quot;{flow.name}&quot;?</AlertDialogTitle>
            <AlertDialogDescription>הזרימה תפסיק לפעול. מה שהיא כבר עשתה נשאר כמו שהוא.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>ביטול</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={(e) => {
                e.preventDefault();
                remove();
              }}
              disabled={pending}
            >
              {pending && <CircleNotch className="animate-spin" />}
              הסר
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Module>
  );
}

// ---------------------------------------------------------------------------

function RecipeCard({ recipe }: { recipe: Recipe }) {
  const router = useRouter();
  const terms = useTerms();
  const ctx = useDescribeContext();
  const dateFields = useFields("customers").filter((f) => f.type === "date");
  const needsDate = recipe.key === "birthday";
  const [dateField, setDateField] = useState<string | undefined>(
    () => (dateFields.find((f) => f.label.includes("הולדת")) ?? dateFields[0])?.key,
  );
  const [pending, start] = useTransition();
  const Icon = RECIPE_ICONS[recipe.key] ?? CookingPot;

  const flow = useMemo(() => {
    const f = recipe.build(terms);
    if (needsDate && f.trigger.type === "days_from_date") f.trigger = { ...f.trigger, field: dateField };
    return f;
  }, [recipe, terms, needsDate, dateField]);
  const sentence = describeAutomation(flow, ctx);
  const blocked = needsDate && (!dateFields.length || !dateField);

  function enable() {
    start(async () => {
      const res = await enableRecipe(recipe.key, needsDate ? { dateField } : {});
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(`"${flow.name}" פועלת`);
      router.refresh();
    });
  }

  return (
    <Module className="flex w-full flex-col">
      <ModuleRail icon={<Icon />} title={recipe.title} />
      <div className="flex flex-1 flex-col gap-3 px-4 py-3.5">
        <p className="text-[13.5px] font-medium">{recipe.why}</p>
        <FlowSentence text={sentence} className="border-s-2 border-border-strong ps-3 text-[13px] text-muted-foreground" />
        {needsDate &&
          (dateFields.length ? (
            <label className="mt-auto flex items-center gap-2 text-[13px]">
              <span className="shrink-0 text-muted-foreground">התאריך:</span>
              <Select value={dateField} onValueChange={setDateField} dir="rtl">
                <SelectTrigger size="sm" aria-label="איזה שדה תאריך">
                  <SelectValue placeholder="בחר שדה תאריך" />
                </SelectTrigger>
                <SelectContent>
                  {dateFields.map((f) => (
                    <SelectItem key={f.key} value={f.key}>
                      {f.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
          ) : (
            <p className="mt-auto border border-dashed border-border-strong bg-rail px-3 py-2 text-[13px] leading-relaxed">
              צריך שדה תאריך ל{terms.customers}, כמו יום הולדת.{" "}
              <Link href="/settings" className="font-medium text-brand underline-offset-4 hover:underline">
                הוסף שדה בהגדרות
              </Link>
            </p>
          ))}
      </div>
      <div className="flex items-center gap-2 border-t border-border bg-rail px-4 py-2.5">
        <Button variant="brand" size="sm" onClick={enable} disabled={pending || blocked}>
          {pending ? <CircleNotch className="animate-spin" /> : <Lightning />}
          הפעל
        </Button>
        <Button asChild variant="ghost" size="sm">
          <Link href={`/automations/new?recipe=${recipe.key}`}>התאם</Link>
        </Button>
      </div>
    </Module>
  );
}
