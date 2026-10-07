"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowRight,
  CircleNotch,
  ClockCountdown,
  FlowArrow,
  Flask,
  Funnel,
  HourglassMedium,
  Lightning,
  Lock,
  Plus,
  Trash,
  WarningCircle,
} from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Module, ModuleRail } from "@/components/ui/module";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Sheet, SheetBody, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { EmptyState } from "@/components/ui/empty-state";
import { useFields, useStages, useTerms } from "@/components/layout/workspace-provider";
import { previewAutomation, saveAutomation, setAutomationEnabled, type AutomationRow, type PreviewResult, type RunRow } from "@/lib/actions/automations";
import { describeAction, describeAutomation, describeCondition, describeTrigger } from "@/lib/automations/describe";
import { recipeByKey } from "@/lib/automations/recipes";
import type { Action } from "@/lib/automations/schema";
import { cn, formatNumber } from "@/lib/utils";
import { Switch } from "./switch";
import { FlowSentence, Tokenized, fillEmpty } from "./flow-sentence";
import { RunList } from "./run-list";
import { ACTION_ICONS, ActionEditor, ConditionEditor, TriggerEditor, WaitEditor } from "./node-editors";
import { conditionFields, conditionFor, firstIssue, nodeIssue, sameNode, subjectOf, useDescribeContext, type Draft, type NodeRef } from "./flow-vocab";

const MAX_CONDITIONS = 8;
const MAX_ACTIONS = 6;

type Tone = "trigger" | "condition" | "wait" | "action";

const TONE_TILE: Record<Tone, string> = {
  trigger: "bg-brand text-white",
  condition: "border border-foreground/60 bg-module text-foreground",
  wait: "border border-dashed border-muted-foreground/60 bg-module text-muted-foreground",
  action: "border border-brand/30 bg-brand-soft text-brand",
};

const PANEL_TEXT: Record<Tone, { title: string; description: string }> = {
  trigger: { title: "כאשר", description: "מה מפעיל את הזרימה." },
  condition: { title: "ואם", description: "מתי להמשיך, ומתי לעצור." },
  wait: { title: "חכה", description: "כמה זמן לחכות לפני שעושים משהו." },
  action: { title: "אז", description: "מה הזרימה עושה." },
};

interface NodeSpec {
  ref: NodeRef;
  tone: Tone;
  title: string;
  sentence: string;
  detail?: string;
  icon: React.ElementType;
}

/** A part the person can add between two others. */
type AddKind = "condition" | "wait" | "action";

function TileIcon({ tone, icon: Icon, className }: { tone: Tone; icon: React.ElementType; className?: string }) {
  return (
    <span className={cn("grid size-6 shrink-0 place-items-center rounded-sm", TONE_TILE[tone], className)}>
      <Icon className="size-3.5" weight={tone === "trigger" ? "fill" : "regular"} />
    </span>
  );
}

function initialDraft(initial: AutomationRow | null, recipeKey: string | undefined, build: () => Draft | null): Draft {
  if (initial) return { name: initial.name, trigger: initial.trigger, conditions: initial.conditions, wait: initial.wait, actions: initial.actions };
  const fromRecipe = recipeKey ? build() : null;
  if (fromRecipe) return fromRecipe;
  return {
    name: "",
    trigger: { type: "record_created", entity: "transactions" },
    conditions: [],
    wait: { days: 0, hours: 0 },
    actions: [{ type: "prepare_whatsapp", body: "" }],
  };
}

const sig = (d: Draft) => JSON.stringify([d.name.trim(), d.trigger, d.conditions, d.wait, d.actions]);

export function FlowEditor({
  initial,
  recipeKey,
  canManage,
  runs,
}: {
  initial: AutomationRow | null;
  recipeKey?: string;
  canManage: boolean;
  runs: RunRow[];
}) {
  const router = useRouter();
  const terms = useTerms();
  const stages = useStages();
  const ctx = useDescribeContext();
  const dateFields = useFields("customers").filter((f) => f.type === "date");
  const readOnly = !canManage;

  const [draft, setDraft] = useState<Draft>(() =>
    initialDraft(initial, recipeKey, () => {
      const r = recipeKey ? recipeByKey(recipeKey) : undefined;
      if (!r) return null;
      const flow = r.build(terms);
      if (flow.trigger.type === "days_from_date" && flow.trigger.anchor === "custom_date") {
        const pick = dateFields.find((f) => f.label.includes("הולדת")) ?? dateFields[0];
        flow.trigger = { ...flow.trigger, field: pick?.key };
      }
      return flow;
    }),
  );
  const [id] = useState<string | null>(initial?.id ?? null);
  const [enabled, setEnabled] = useState(initial?.enabled ?? false);
  const [baseline, setBaseline] = useState<string>(() => (initial ? sig(draft) : ""));
  const [selected, setSelected] = useState<NodeRef | null>(null);
  const [showIssue, setShowIssue] = useState(false);
  const [preview, setPreview] = useState<{ key: string; result?: PreviewResult; error?: string } | null>(null);
  const [saving, startSave] = useTransition();
  const [testing, startTest] = useTransition();
  const validRecipe = recipeKey && recipeByKey(recipeKey) ? recipeKey : null;

  const dirty = sig(draft) !== baseline;
  const issue = firstIssue(draft);
  const subject = subjectOf(draft.trigger);
  const previewKey = JSON.stringify([draft.trigger, draft.conditions]);
  const shownPreview = preview && preview.key === previewKey ? preview : null;

  // Leaving with unsaved work asks first.
  useEffect(() => {
    if (!dirty || readOnly) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty, readOnly]);

  const update = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }));

  // ---- the parts, in reading order (right to left on wide screens)
  const nodes = useMemo<NodeSpec[]>(() => {
    const list: NodeSpec[] = [
      { ref: { kind: "trigger" }, tone: "trigger", title: "כאשר", sentence: describeTrigger(draft.trigger, ctx).replace(/^כאשר /, ""), icon: Lightning },
    ];
    draft.conditions.forEach((c, i) =>
      list.push({ ref: { kind: "condition", i }, tone: "condition", title: i === 0 ? "ואם" : "וגם", sentence: describeCondition(c, ctx).replace(/^ו/, ""), icon: Funnel }),
    );
    if (draft.wait.days || draft.wait.hours) {
      const w = [draft.wait.days ? (draft.wait.days === 1 ? "יום אחד" : `${draft.wait.days} ימים`) : "", draft.wait.hours ? `${draft.wait.hours} שעות` : ""].filter(Boolean).join(" ו־");
      list.push({ ref: { kind: "wait" }, tone: "wait", title: "חכה", sentence: `${w}, ואז ממשיכים`, icon: HourglassMedium });
    }
    draft.actions.forEach((a, i) =>
      list.push({
        ref: { kind: "action", i },
        tone: "action",
        title: i === 0 ? "אז" : "וגם",
        sentence: fillEmpty(describeAction(a, ctx)),
        detail: a.type === "prepare_whatsapp" ? a.body : a.type === "add_note" ? a.text : undefined,
        icon: ACTION_ICONS[a.type],
      }),
    );
    return list;
  }, [draft, ctx]);

  /** What the "+" between two parts can add there. */
  function addOptions(a: NodeSpec, b: NodeSpec | undefined): AddKind[] {
    const out: AddKind[] = [];
    const early = a.tone === "trigger" || a.tone === "condition";
    if (early && draft.conditions.length < MAX_CONDITIONS) out.push("condition");
    if (early && b?.tone === "action" && !draft.wait.days && !draft.wait.hours) out.push("wait");
    if (!early && draft.actions.length < MAX_ACTIONS) out.push("action");
    return out;
  }

  function add(kind: AddKind, after: NodeRef) {
    if (kind === "condition") {
      const at = after.kind === "condition" ? after.i + 1 : 0;
      const first = conditionFields(subject, terms, stages, []).find((f) => f.value === "has_phone") ?? conditionFields(subject, terms, stages, [])[0];
      if (!first) return;
      const conditions = [...draft.conditions];
      conditions.splice(at, 0, conditionFor(first));
      update({ conditions });
      setSelected({ kind: "condition", i: at });
    } else if (kind === "wait") {
      update({ wait: { days: 1, hours: 0 } });
      setSelected({ kind: "wait" });
    } else {
      const at = after.kind === "action" ? after.i + 1 : 0;
      const actions = [...draft.actions];
      actions.splice(at, 0, { type: "create_task", title: "", due_in_days: 0 });
      update({ actions });
      setSelected({ kind: "action", i: at });
    }
  }

  function removeSelected() {
    if (!selected) return;
    if (selected.kind === "condition") update({ conditions: draft.conditions.filter((_, i) => i !== selected.i) });
    else if (selected.kind === "wait") update({ wait: { days: 0, hours: 0 } });
    else if (selected.kind === "action" && draft.actions.length > 1) update({ actions: draft.actions.filter((_, i) => i !== selected.i) });
    setSelected(null);
  }

  // ---- save / switch / try

  async function persist(nextEnabled?: boolean): Promise<boolean> {
    const res = await saveAutomation({
      ...draft,
      name: draft.name.trim(),
      id,
      ...(nextEnabled !== undefined ? { enabled: nextEnabled } : {}),
      ...(!id && validRecipe ? { recipe_key: validRecipe } : {}),
    });
    if (!res.ok) {
      toast.error(res.error);
      return false;
    }
    setBaseline(sig(draft));
    if (!id) {
      toast.success(nextEnabled ? "הזרימה נשמרה ופועלת" : "הזרימה נשמרה. היא כבויה עד שתפעיל אותה.");
      router.replace(`/automations/${res.data.id}`);
    } else {
      toast.success(nextEnabled === undefined ? "הכל נשמר" : nextEnabled ? "הזרימה פועלת" : "הזרימה כבויה");
      router.refresh();
    }
    return true;
  }

  function save() {
    if (issue) {
      setShowIssue(true);
      return;
    }
    startSave(async () => {
      await persist();
    });
  }

  function toggle(next: boolean) {
    if (!id || dirty) {
      if (issue) {
        setShowIssue(true);
        return;
      }
      setEnabled(next);
      startSave(async () => {
        if (!(await persist(next))) setEnabled(!next);
      });
      return;
    }
    setEnabled(next);
    startSave(async () => {
      const res = await setAutomationEnabled(id, next);
      if (!res.ok) {
        setEnabled(!next);
        toast.error(res.error);
        return;
      }
      toast.success(next ? "הזרימה פועלת" : "הזרימה כבויה");
      router.refresh();
    });
  }

  function tryNow() {
    const key = previewKey;
    const blocking = [nodeIssue(draft, { kind: "trigger" }), ...draft.conditions.map((_, i) => nodeIssue(draft, { kind: "condition", i }))].find(Boolean);
    if (blocking) {
      setPreview({ key, error: blocking });
      return;
    }
    startTest(async () => {
      const res = await previewAutomation({ trigger: draft.trigger, conditions: draft.conditions });
      setPreview(res.ok ? { key, result: res.data } : { key, error: res.error });
    });
  }

  const selectedNode = selected ? nodes.find((n) => sameNode(n.ref, selected)) : undefined;
  const panelTone: Tone | null = selected ? (selected.kind as Tone) : null;
  const canDelete = !readOnly && !!selected && (selected.kind === "condition" || selected.kind === "wait" || (selected.kind === "action" && draft.actions.length > 1));

  return (
    <div className="space-y-5">
      {/* Top bar: name, try, on/off, save */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <Button asChild variant="ghost" size="icon-sm" className="shrink-0 text-muted-foreground">
            <Link href="/automations" aria-label="חזרה לזרימות">
              <ArrowRight />
            </Link>
          </Button>
          {readOnly ? (
            <h1 className="min-w-0 truncate text-2xl font-bold tracking-tight">{draft.name || "זרימה"}</h1>
          ) : (
            <input
              value={draft.name}
              onChange={(e) => update({ name: e.target.value.slice(0, 80) })}
              placeholder="תן שם לזרימה"
              aria-label="שם הזרימה"
              dir="auto"
              className={cn(
                "h-10 min-w-0 flex-1 rounded-sm border border-transparent bg-transparent px-2 text-2xl font-bold tracking-tight transition-colors placeholder:font-normal placeholder:text-muted-foreground/60 hover:border-border focus-visible:border-brand focus-visible:bg-module focus-visible:outline-none",
                showIssue && !draft.name.trim() && "border-negative/50",
              )}
            />
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2 ps-10 lg:ps-0">
          <Button variant="outline" size="sm" onClick={tryNow} disabled={testing}>
            {testing ? <CircleNotch className="animate-spin" /> : <Flask />}
            נסה עכשיו
          </Button>
          {readOnly ? (
            <Badge variant={enabled ? "positive" : "outline"}>{enabled ? "פועלת" : "כבויה"}</Badge>
          ) : (
            <>
              <label className="flex h-8 cursor-pointer items-center gap-2 rounded-sm border border-border bg-module px-2.5 text-[13px] shadow-xs">
                <Switch checked={enabled} onCheckedChange={toggle} disabled={saving} aria-label="הזרימה פועלת" />
                <span className={cn("min-w-11", enabled ? "font-medium text-foreground" : "text-muted-foreground")}>{enabled ? "פועלת" : "כבויה"}</span>
              </label>
              <Button variant="brand" size="sm" onClick={save} disabled={saving || (!!id && !dirty)}>
                {saving && <CircleNotch className="animate-spin" />}
                {id && !dirty ? "נשמר" : "שמור"}
              </Button>
            </>
          )}
        </div>
      </div>

      {/* The whole flow as one sentence */}
      <Module>
        <ModuleRail
          icon={<FlowArrow />}
          title="מה הזרימה עושה"
          meta={!readOnly && dirty && id ? <span className="text-warning">יש שינויים שלא נשמרו</span> : undefined}
        />
        <div className="space-y-3 px-4 py-3.5 sm:px-5">
          <FlowSentence text={describeAutomation(draft, ctx)} strong className="text-[15px] sm:text-base" />
          {showIssue && issue && (
            <p role="alert" className="flex items-center gap-1.5 text-[13px] font-medium text-negative">
              <WarningCircle className="size-4 shrink-0" />
              {issue.message}
            </p>
          )}
          {shownPreview && <PreviewLine preview={shownPreview} />}
        </div>
      </Module>

      {readOnly && (
        <p className="flex items-center gap-1.5 text-[13px] text-muted-foreground">
          <Lock className="size-4 shrink-0" />
          רק בעלים ומנהלים יכולים לשנות זרימות. אפשר לראות איך היא בנויה.
        </p>
      )}

      {/* The canvas */}
      <div className="dot-grid grain relative border border-border bg-table">
        {!readOnly && <p className="px-4 pt-3.5 text-[13px] text-muted-foreground sm:px-6">לחץ על כל חלק כדי לשנות אותו.</p>}
        <div className="overflow-x-auto">
          <ol className="flex flex-col items-stretch p-4 sm:p-6 md:w-max md:min-w-full md:flex-row md:items-center md:p-8" aria-label="חלקי הזרימה">
            {nodes.map((n, idx) => {
              const next = nodes[idx + 1];
              const opts = readOnly ? [] : addOptions(n, next);
              const isLast = idx === nodes.length - 1;
              return (
                <li key={`${n.ref.kind}-${"i" in n.ref ? n.ref.i : 0}`} className="contents">
                  <FlowNode
                    node={n}
                    index={idx + 1}
                    hasIn={idx > 0}
                    hasOut={!isLast || (!readOnly && draft.actions.length < MAX_ACTIONS)}
                    live={enabled}
                    selected={sameNode(selected, n.ref)}
                    issue={nodeIssue(draft, n.ref) ?? (showIssue && issue?.node && sameNode(issue.node, n.ref) ? issue.message : null)}
                    onOpen={() => setSelected(n.ref)}
                  />
                  {!isLast && <Connector live={enabled} options={opts} onAdd={(k) => add(k, n.ref)} />}
                  {isLast && !readOnly && draft.actions.length < MAX_ACTIONS && (
                    <>
                      <Connector live={false} options={[]} dashed />
                      <button
                        type="button"
                        onClick={() => add("action", n.ref)}
                        className="flex h-14 w-full shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-sm border border-dashed border-border-strong bg-module/60 text-[13px] text-muted-foreground transition-[border-color,color,background-color,transform] hover:border-brand/60 hover:bg-module hover:text-brand active:translate-y-px md:w-40"
                      >
                        <Plus className="size-4" />
                        עוד פעולה
                      </button>
                    </>
                  )}
                </li>
              );
            })}
          </ol>
        </div>
      </div>

      {id && (
        <Module>
          <ModuleRail icon={<ClockCountdown />} title="מה קרה לאחרונה" meta={initial ? <span>הופעלה <span className="num">{formatNumber(initial.runs_count)}</span> פעמים</span> : undefined} />
          {runs.length ? (
            <RunList runs={runs} showFlow={false} limit={8} />
          ) : (
            <EmptyState compact icon={<ClockCountdown />} title="עוד לא קרה כלום" description={enabled ? "כשהזרימה תפעל על משהו, זה יופיע כאן." : "הפעל את הזרימה, וכל מה שהיא עושה יופיע כאן."} />
          )}
        </Module>
      )}

      {/* Side panel: the selected part as a sentence of chips */}
      <Sheet open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <SheetContent className="sm:max-w-lg">
          {panelTone && (
            <>
              <SheetHeader>
                <div className="flex items-center gap-2.5">
                  <TileIcon tone={panelTone} icon={selectedNode?.icon ?? (panelTone === "wait" ? HourglassMedium : Lightning)} />
                  <SheetTitle>{selectedNode?.title ?? PANEL_TEXT[panelTone].title}</SheetTitle>
                </div>
                <SheetDescription>{readOnly ? "תצוגה בלבד." : PANEL_TEXT[panelTone].description}</SheetDescription>
              </SheetHeader>
              <SheetBody>
                {selected?.kind === "trigger" && (
                  <TriggerEditor
                    trigger={draft.trigger}
                    readOnly={readOnly}
                    onChange={(trigger) => {
                      // Conditions belong to one kind of record; a new kind keeps only those that still fit.
                      const nextSubject = subjectOf(trigger);
                      const conditions =
                        nextSubject === subject ? draft.conditions : draft.conditions.filter((c) => conditionFields(nextSubject, terms, stages, []).some((f) => f.value === c.field));
                      update({ trigger, conditions });
                    }}
                  />
                )}
                {selected?.kind === "condition" && draft.conditions[selected.i] && (
                  <ConditionEditor
                    condition={draft.conditions[selected.i]}
                    subject={subject}
                    readOnly={readOnly}
                    onChange={(c) => update({ conditions: draft.conditions.map((x, i) => (i === selected.i ? c : x)) })}
                  />
                )}
                {selected?.kind === "wait" && <WaitEditor wait={draft.wait} readOnly={readOnly} onChange={(wait) => update({ wait })} />}
                {selected?.kind === "action" && draft.actions[selected.i] && (
                  <ActionEditor
                    action={draft.actions[selected.i]}
                    subject={subject}
                    readOnly={readOnly}
                    onChange={(a: Action) => update({ actions: draft.actions.map((x, i) => (i === selected.i ? a : x)) })}
                  />
                )}
              </SheetBody>
              <SheetFooter className="justify-between">
                {canDelete ? (
                  <Button variant="ghost" size="sm" className="text-destructive hover:bg-negative-soft" onClick={removeSelected}>
                    <Trash />
                    {selected?.kind === "wait" ? "בלי המתנה" : "הסר את החלק הזה"}
                  </Button>
                ) : (
                  <span />
                )}
                <Button variant={readOnly ? "outline" : "brand"} size="sm" onClick={() => setSelected(null)}>
                  {readOnly ? "סגור" : "סיום"}
                </Button>
              </SheetFooter>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

// ---------------------------------------------------------------------------

function FlowNode({
  node,
  index,
  hasIn,
  hasOut,
  live,
  selected,
  issue,
  onOpen,
}: {
  node: NodeSpec;
  index: number;
  hasIn: boolean;
  hasOut: boolean;
  live: boolean;
  selected: boolean;
  issue: string | null;
  onOpen: () => void;
}) {
  const port = cn("absolute z-[1] size-[9px] border bg-module", live ? "border-brand bg-brand" : "border-border-strong");
  return (
    <Module
      role="button"
      tabIndex={0}
      aria-label={`${node.title}: ${node.sentence}`}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
      className={cn(
        "group w-full shrink-0 cursor-pointer text-start transition-[border-color,box-shadow,transform] duration-150 hover:border-border-strong active:translate-y-px md:w-56 xl:w-64",
        selected && "border-brand ring-2 ring-brand/15 hover:border-brand",
        issue && !selected && "border-warning/60",
      )}
    >
      {hasIn && <span aria-hidden className={cn(port, "max-md:inset-x-0 max-md:-top-[5px] max-md:mx-auto md:top-1/2 md:-start-[5px] md:-translate-y-1/2")} />}
      {hasOut && <span aria-hidden className={cn(port, "max-md:inset-x-0 max-md:-bottom-[5px] max-md:mx-auto md:top-1/2 md:-end-[5px] md:-translate-y-1/2")} />}
      <ModuleRail index={index} title={node.title} className="min-h-10">
        <TileIcon tone={node.tone} icon={node.icon} />
      </ModuleRail>
      <div className="min-h-[4.25rem] space-y-1 px-3.5 py-3">
        <p className="text-[14px] leading-relaxed">
          <Tokenized text={node.sentence} />
        </p>
        {node.detail?.trim() && (
          <p className="line-clamp-2 text-xs leading-relaxed text-muted-foreground" dir="auto">
            <Tokenized text={node.detail} />
          </p>
        )}
      </div>
      {issue && (
        <div className="flex items-center gap-1.5 border-t border-border bg-warning-soft px-3.5 py-1.5 text-xs font-medium text-warning">
          <WarningCircle className="size-3.5 shrink-0" />
          {issue}
        </div>
      )}
    </Module>
  );
}

const ADD_LABELS: Record<AddKind, { label: string; hint: string; icon: React.ElementType }> = {
  condition: { label: "תנאי", hint: "ואם… רק כש", icon: Funnel },
  wait: { label: "המתנה", hint: "חכה… ואז", icon: HourglassMedium },
  action: { label: "פעולה", hint: "אז… עשה", icon: Plus },
};

/** The line between two parts; carries a moving dash while the flow is on. Holds the "+" that adds a part there. */
function Connector({ live, options, onAdd, dashed }: { live: boolean; options: AddKind[]; onAdd?: (k: AddKind) => void; dashed?: boolean }) {
  const stroke = live ? "var(--brand)" : "var(--line)";
  const lineClass = live ? "flow-dash" : dashed ? "[stroke-dasharray:3_4]" : undefined;
  const plus =
    "relative z-[1] grid size-6 cursor-pointer place-items-center rounded-sm border border-border-strong bg-module text-muted-foreground shadow-xs transition-[border-color,color,transform] hover:border-brand hover:text-brand active:translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 data-[state=open]:border-brand data-[state=open]:text-brand";
  return (
    <div className="relative flex h-12 shrink-0 items-center justify-center md:h-10 md:w-12 xl:w-14" aria-hidden={!options.length || undefined}>
      <svg className="pointer-events-none absolute inset-0 size-full overflow-visible" aria-hidden>
        <line className={cn("md:hidden", lineClass)} x1="50%" y1="0" x2="50%" y2="100%" stroke={stroke} strokeWidth={live ? 1.5 : 1} />
        <line className={cn("hidden md:block", lineClass)} x1="100%" y1="50%" x2="0" y2="50%" stroke={stroke} strokeWidth={live ? 1.5 : 1} />
      </svg>
      {options.length === 1 && onAdd && (
        <button type="button" className={plus} onClick={() => onAdd(options[0])} aria-label={`הוסף ${ADD_LABELS[options[0]].label}`} title={`הוסף ${ADD_LABELS[options[0]].label}`}>
          <Plus className="size-3.5" weight="bold" />
        </button>
      )}
      {options.length > 1 && onAdd && (
        <DropdownMenu dir="rtl">
          <DropdownMenuTrigger asChild>
            <button type="button" className={plus} aria-label="הוסף חלק כאן">
              <Plus className="size-3.5" weight="bold" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="center" className="min-w-44">
            {options.map((k) => {
              const Icon = ADD_LABELS[k].icon;
              return (
                <DropdownMenuItem key={k} onSelect={() => onAdd(k)} className="py-2">
                  <Icon />
                  <span className="flex flex-col">
                    <span>הוסף {ADD_LABELS[k].label}</span>
                    <span className="text-xs text-muted-foreground">{ADD_LABELS[k].hint}</span>
                  </span>
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}

function PreviewLine({ preview }: { preview: { result?: PreviewResult; error?: string } }) {
  if (preview.error) {
    return (
      <p className="flex items-center gap-1.5 text-[13px] text-negative">
        <WarningCircle className="size-4 shrink-0" />
        {preview.error}
      </p>
    );
  }
  const r = preview.result;
  if (!r) return null;
  const names = r.names.slice(0, 8);
  const more = r.total > names.length;
  const list = names.length ? `: ${names.join(", ")}${more ? "…" : ""}` : "";
  return (
    <div className="flex items-start gap-2 border border-border bg-rail px-3 py-2.5 text-[13.5px] leading-relaxed">
      <Flask className="mt-0.5 size-4 shrink-0 text-brand" />
      <p>
        {r.total === 0 ? (
          r.window === "today" ? (
            "היום אין על מי להפעיל. זה בסדר: הזרימה תחכה לרגע הנכון."
          ) : (
            "ב־30 הימים האחרונים לא היה מקרה כזה. הזרימה תפעל כשזה יקרה."
          )
        ) : r.window === "today" ? (
          r.total === 1 && names.length === 1 ? (
            <>היום זה היה פועל על {names[0]}.</>
          ) : (
            <>
              היום זה היה פועל על <span className="num font-medium">{formatNumber(r.total)}</span>
              {list}
            </>
          )
        ) : r.total === 1 ? (
          <>ב־30 הימים האחרונים זה היה פועל פעם אחת{list}</>
        ) : (
          <>
            ב־30 הימים האחרונים זה היה פועל <span className="num font-medium">{formatNumber(r.total)}</span> פעמים{list}
          </>
        )}
        <span className="block text-xs text-muted-foreground">זו רק בדיקה. שום דבר לא נשלח ולא נשמר.</span>
      </p>
    </div>
  );
}

