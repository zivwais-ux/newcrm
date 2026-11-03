"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { toast } from "sonner";
import { ArrowsClockwise, CheckCircle, CircleNotch, WarningCircle } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Ltr } from "@/components/ui/ltr";
import { AgentActionButton } from "@/components/agents/agent-action-button";
import { AgentAvatar } from "@/components/agents/agent-avatar";
import { RelativeTime } from "@/components/automations/relative-time";
import { markInsight, runAgents } from "@/lib/actions/agents";
import { PERSONAS } from "@/lib/agents/personas";
import type { AgentKey, Insight } from "@/lib/agents/validate";
import type { AgentData, AgentInsightRow } from "@/lib/components/loaders";
import { cn } from "@/lib/utils";
import type { ViewProps } from "../shared";

/** What each agent does, in its own voice (names and roles live in lib/agents/personas.ts). */
const AGENTS: Record<AgentKey, { purpose: string; willDo: string }> = {
  revenue: {
    purpose: "עוקבת אחרי הכסף שנכנס ומוצאת הזדמנויות.",
    willDo: "כשתריץ אותה, היא תעבור על המכירות ותראה לך איפה יש כסף שמחכה לך.",
  },
  customers: {
    purpose: "שם לב ללקוחות שהתרחקו ואומר למי כדאי לחזור.",
    willDo: "כשתריץ אותו, הוא יבדוק מי הפסיק להגיע ויכין לך הודעה לכל אחד.",
  },
  sales: {
    purpose: "בודק את העסקאות הפתוחות ואומר מה יקדם כל אחת.",
    willDo: "כשתריץ אותו, הוא יעבור על העסקאות ויגיד לך איזו תקועה ומה הצעד הבא.",
  },
  chief: {
    purpose: "קוראת את מה שכל הסוכנים מצאו ובוחרת מה הכי חשוב היום.",
    willDo: "כשתריץ אותה, היא תאסוף את מה שנועה, אורי ותום מצאו ותבחר את 3 הדברים הכי חשובים.",
  },
};

const SEVERITY: Record<Insight["severity"], { label: string; dot: string; rail: string }> = {
  critical: { label: "דחוף", dot: "bg-negative", rail: "bg-negative" },
  warning: { label: "שים לב", dot: "bg-warning", rail: "bg-warning" },
  opportunity: { label: "הזדמנות", dot: "bg-brand", rail: "bg-brand" },
  info: { label: "לידיעה", dot: "bg-muted-foreground/60", rail: "bg-border-strong" },
};

const HEBREW = /[֐-׿]/;

/** Runs the whole agent team now. While a run is open anywhere, shows the working state. */
function useRunAgents(serverRunning: boolean) {
  const router = useRouter();
  const [running, setRunning] = useState(false);

  // A run started elsewhere (another module or tab): check back until it finishes.
  useEffect(() => {
    if (!serverRunning || running) return;
    const id = window.setInterval(() => router.refresh(), 8_000);
    return () => window.clearInterval(id);
  }, [serverRunning, running, router]);

  async function run() {
    setRunning(true);
    try {
      const res = await runAgents();
      if (!res.ok) toast.error(res.error);
      else router.refresh();
    } catch {
      toast.error("משהו השתבש. נסה שוב.");
    } finally {
      setRunning(false);
    }
  }
  return { run, working: running || serverRunning };
}

function RunButton({
  onRun,
  working,
  label = "הרץ עכשיו",
  variant = "outline",
  size = "xs",
}: {
  onRun: () => void;
  working: boolean;
  label?: string;
  variant?: "outline" | "brand";
  size?: "xs" | "sm";
}) {
  return (
    <Button size={size} variant={variant} onClick={onRun} disabled={working}>
      {working ? <CircleNotch className="animate-spin" /> : <ArrowsClockwise />}
      {working ? "עובדים…" : label}
    </Button>
  );
}

function EvidenceValue({ value }: { value: string }) {
  if (HEBREW.test(value)) return <span className="font-medium">{value}</span>;
  return <Ltr className="num font-medium">{value}</Ltr>;
}

function InsightCard({
  insight,
  index,
  onHandled,
  onRestore,
}: {
  insight: AgentInsightRow;
  /** 1-based number, shown instead of the dot (the chief's list). */
  index?: number;
  onHandled: () => void;
  onRestore: () => void;
}) {
  const sev = SEVERITY[insight.severity] ?? SEVERITY.info;
  const actions = insight.actions.slice(0, 3);

  async function dismiss() {
    onHandled();
    const res = await markInsight(insight.id, "dismissed");
    if (!res.ok) {
      onRestore();
      toast.error(res.error);
    }
  }

  return (
    <article className="relative rounded-lg border border-border/80 bg-module py-3 pe-3 ps-4 shadow-xs transition-shadow duration-200 hover:shadow-sm">
      <span aria-hidden className={cn("absolute inset-y-3 start-0 w-[3px] rounded-e-full", sev.rail)} />
      <div className="flex items-start gap-2.5">
        {index !== undefined ? (
          <span className="num mt-px w-4 shrink-0 text-[15px] font-semibold text-foreground" aria-hidden>
            {index}
          </span>
        ) : (
          <span className={cn("mt-[7px] size-2 shrink-0 rounded-full", sev.dot)} title={sev.label} aria-hidden />
        )}
        <div className="min-w-0 flex-1">
          <p className="text-[14px] leading-snug font-semibold">
            <span className="sr-only">{sev.label}: </span>
            {insight.headline}
          </p>
          {insight.detail && <p className="mt-1 text-[13px] leading-relaxed whitespace-pre-line text-muted-foreground">{insight.detail}</p>}
          {insight.evidence.length > 0 && (
            <dl className="mt-2.5 grid grid-cols-2 gap-x-4 gap-y-1.5 rounded-md bg-rail px-3 py-2.5">
              {insight.evidence.map((e, i) => (
                <div key={i} className="min-w-0">
                  <dt className="truncate text-[11px] text-muted-foreground">{e.label}</dt>
                  <dd className="truncate text-[13px]">
                    <EvidenceValue value={e.value} />
                  </dd>
                </div>
              ))}
            </dl>
          )}
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            {actions.map((a, i) => (
              <AgentActionButton
                key={`${a.type}-${i}`}
                action={a}
                insightId={insight.id}
                primary={i === 0}
                onHandled={a.type === "open_view" ? undefined : onHandled}
                onRestore={onRestore}
              />
            ))}
            <Button size="xs" variant="ghost" className="text-muted-foreground" onClick={dismiss}>
              דלג
            </Button>
          </div>
        </div>
      </div>
    </article>
  );
}

export function AgentView({ data }: ViewProps<AgentData>) {
  const reduce = useReducedMotion();
  const meta = AGENTS[data.agent];
  const persona = PERSONAS[data.agent];
  const failed = data.lastRun?.status === "failed";
  const { run, working } = useRunAgents(data.lastRun?.status === "running");
  const [hidden, setHidden] = useState<Set<string>>(() => new Set());

  const isChief = data.agent === "chief";
  const visible = data.insights.filter((i) => !hidden.has(i.id));
  const shown = isChief ? visible.slice(0, 3) : visible;
  const hide = (id: string) => setHidden((s) => new Set(s).add(id));
  const unhide = (id: string) =>
    setHidden((s) => {
      const next = new Set(s);
      next.delete(id);
      return next;
    });

  const neverRan = !data.updatedAt && !data.lastRun;

  return (
    <div className="space-y-3.5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <AgentAvatar agent={data.agent} working={working} />
        <div className="min-w-0 flex-1 basis-[12rem]">
          <p className="truncate text-[14px] leading-tight font-semibold tracking-tight">
            {persona.name} <span className="font-normal text-muted-foreground">· {persona.role}</span>
          </p>
          <p className="mt-0.5 text-[13px] leading-snug text-muted-foreground">{meta.purpose}</p>
        </div>
        {!neverRan && (
          <div className="ms-auto flex shrink-0 items-center gap-2">
            {data.updatedAt && !working && (
              <span className="text-xs text-muted-foreground">
                עודכן <RelativeTime value={data.updatedAt} />
              </span>
            )}
            <RunButton onRun={run} working={working} />
          </div>
        )}
      </div>

      <AnimatePresence initial={false}>
        {working && (
          <motion.p
            key="working"
            role="status"
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="flex items-center gap-2 rounded-md border border-brand/15 bg-brand-soft px-3 py-2 text-[13px] text-brand"
          >
            <span className="relative flex size-2 shrink-0">
              <span className="absolute inset-0 animate-ping rounded-full bg-brand/50 motion-reduce:hidden" />
              <span className="relative size-2 rounded-full bg-brand" />
            </span>
            <span>
              <span className="font-semibold">
                {persona.name} {persona.working}…
              </span>{" "}
              בערך חצי דקה
            </span>
          </motion.p>
        )}
      </AnimatePresence>

      {failed && !working && (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-negative/20 bg-negative-soft px-3 py-2">
          <p className="flex items-center gap-2 text-[13px] text-negative">
            <WarningCircle className="size-4 shrink-0" />
            הריצה האחרונה לא הצליחה. הממצאים הקודמים נשארו כמו שהם.
          </p>
          <RunButton onRun={run} working={working} label="נסה שוב" />
        </div>
      )}

      {neverRan && !working ? (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border-strong/70 bg-rail/60 px-4 py-6 text-center">
          <AgentAvatar agent={data.agent} size="lg" />
          <div className="max-w-sm space-y-1">
            <p className="text-sm font-semibold tracking-tight">
              {persona.name} עוד לא {persona.ran}
            </p>
            <p className="text-[13px] leading-relaxed text-muted-foreground">{meta.willDo}</p>
          </div>
          <RunButton onRun={run} working={working} variant="brand" size="sm" />
        </div>
      ) : shown.length > 0 ? (
        <div className="space-y-2">
          {isChief && <p className="text-[15px] font-semibold tracking-tight">3 הדברים החשובים היום</p>}
          <ul className="space-y-2">
            <AnimatePresence initial={false}>
              {shown.map((insight, i) => (
                <motion.li
                  key={insight.id}
                  layout={!reduce}
                  initial={reduce ? false : { opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0, transition: { duration: 0.35, delay: reduce ? 0 : Math.min(i, 6) * 0.05, ease: [0.2, 0.7, 0.2, 1] } }}
                  exit={reduce ? { opacity: 0 } : { opacity: 0, height: 0, transition: { duration: 0.18 } }}
                  className="overflow-hidden rounded-lg"
                >
                  <InsightCard insight={insight} index={isChief ? i + 1 : undefined} onHandled={() => hide(insight.id)} onRestore={() => unhide(insight.id)} />
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
        </div>
      ) : (
        !working &&
        !failed && (
          <div className="flex flex-col items-center gap-2 py-5 text-center">
            <span className="grid size-10 place-items-center rounded-[12px] bg-positive-soft text-positive">
              <CheckCircle className="size-5" weight="fill" />
            </span>
            <p className="text-sm font-semibold tracking-tight">
              {data.updatedAt ? `טיפלת בכל מה ש${persona.name} ${persona.found}` : `${persona.name} לא ${persona.found} משהו שדורש טיפול`}
            </p>
            <p className="text-[13px] text-muted-foreground">ממצאים חדשים יופיעו כאן בריצה הבאה.</p>
          </div>
        )
      )}
    </div>
  );
}
