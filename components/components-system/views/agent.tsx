"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { toast } from "sonner";
import { ArrowsClockwise, Check, CircleNotch, Coins, Compass, Target, UserCircleCheck, WarningCircle } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Ltr } from "@/components/ui/ltr";
import { AgentActionButton } from "@/components/agents/agent-action-button";
import { RelativeTime } from "@/components/automations/relative-time";
import { markInsight, runAgents } from "@/lib/actions/agents";
import type { AgentKey, Insight } from "@/lib/agents/validate";
import type { AgentData, AgentInsightRow } from "@/lib/components/loaders";
import { cn } from "@/lib/utils";
import type { ViewProps } from "../shared";

const AGENTS: Record<AgentKey, { name: string; purpose: string; willDo: string; icon: React.ElementType }> = {
  revenue: {
    name: "אנליסט הכנסות",
    purpose: "עוקב אחרי הכסף שנכנס ומוצא הזדמנויות.",
    willDo: "כשתריץ אותו, הוא יעבור על המכירות ויראה לך איפה יש כסף שמחכה לך.",
    icon: Coins,
  },
  customers: {
    name: "שומר לקוחות",
    purpose: "שם לב ללקוחות שהתרחקו ואומר למי כדאי לחזור.",
    willDo: "כשתריץ אותו, הוא יבדוק מי הפסיק להגיע ויכין לך הודעה לכל אחד.",
    icon: UserCircleCheck,
  },
  sales: {
    name: "מאמן מכירות",
    purpose: "בודק את העסקאות הפתוחות ואומר מה יקדם כל אחת.",
    willDo: "כשתריץ אותו, הוא יעבור על העסקאות ויגיד לך איזו תקועה ומה הצעד הבא.",
    icon: Target,
  },
  chief: {
    name: "ראש מטה",
    purpose: "קורא את מה שכל הסוכנים מצאו ובוחר מה הכי חשוב היום.",
    willDo: "כשתריץ אותו, הוא יאסוף את מה שהסוכנים מצאו ויבחר את 3 הדברים הכי חשובים.",
    icon: Compass,
  },
};

const SEVERITY: Record<Insight["severity"], { label: string; dot: string; rail: string }> = {
  critical: { label: "דחוף", dot: "bg-negative", rail: "border-s-negative" },
  warning: { label: "שים לב", dot: "bg-warning", rail: "border-s-warning" },
  opportunity: { label: "הזדמנות", dot: "bg-brand", rail: "border-s-brand" },
  info: { label: "לידיעה", dot: "bg-muted-foreground/60", rail: "border-s-border-strong" },
};

const WORKING = "הסוכנים עובדים… בערך חצי דקה";
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

function RunButton({ onRun, working, label = "הרץ עכשיו", variant = "outline" }: { onRun: () => void; working: boolean; label?: string; variant?: "outline" | "brand" }) {
  return (
    <Button size="xs" variant={variant} onClick={onRun} disabled={working}>
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
    <article className={cn("border border-s-2 border-border bg-module py-3 pe-3 ps-3.5", sev.rail)}>
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
            <dl className="mt-2.5 grid grid-cols-2 gap-x-4 gap-y-1.5 border-t border-border pt-2.5">
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
  const Icon = meta.icon;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <p className="min-w-0 text-[13px] text-muted-foreground">{meta.purpose}</p>
        {!neverRan && (
          <div className="flex shrink-0 items-center gap-2">
            {data.updatedAt && (
              <span className="text-xs text-muted-foreground">
                עודכן <RelativeTime value={data.updatedAt} />
              </span>
            )}
            <RunButton onRun={run} working={working} />
          </div>
        )}
      </div>

      {working && (
        <p role="status" className="flex items-center gap-2 border border-brand/20 bg-brand-soft px-3 py-2 text-[13px] text-brand">
          <CircleNotch className="size-4 shrink-0 animate-spin" />
          {WORKING}
        </p>
      )}

      {failed && !working && (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-2 border border-negative/25 bg-negative-soft px-3 py-2">
          <p className="flex items-center gap-2 text-[13px] text-negative">
            <WarningCircle className="size-4 shrink-0" />
            הריצה האחרונה לא הצליחה. הממצאים הקודמים נשארו כמו שהם.
          </p>
          <RunButton onRun={run} working={working} label="נסה שוב" />
        </div>
      )}

      {neverRan && !working ? (
        <EmptyState
          compact
          icon={<Icon />}
          title="הסוכן עוד לא רץ"
          description={meta.willDo}
          action={<RunButton onRun={run} working={working} variant="brand" />}
        />
      ) : shown.length > 0 ? (
        <div className="space-y-2">
          {isChief && <p className="text-[15px] font-semibold tracking-tight">3 הדברים החשובים היום</p>}
          <ul className="space-y-2">
            <AnimatePresence initial={false}>
              {shown.map((insight, i) => (
                <motion.li
                  key={insight.id}
                  layout={!reduce}
                  initial={false}
                  exit={reduce ? { opacity: 0 } : { opacity: 0, height: 0, transition: { duration: 0.18 } }}
                  className="overflow-hidden"
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
          <EmptyState
            compact
            icon={<Check />}
            title={data.updatedAt ? "טיפלת בכל מה שהסוכן מצא" : "הסוכן לא מצא משהו שדורש טיפול"}
            description="ממצאים חדשים יופיעו כאן בריצה הבאה."
          />
        )
      )}
    </div>
  );
}
