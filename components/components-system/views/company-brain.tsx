"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowUp,
  Brain,
  ChartBar,
  Check,
  CircleNotch,
  Clock,
  Envelope,
  HandPalm,
  Handshake,
  Info,
  Lightbulb,
  LockSimple,
  Question,
  User,
  ChatCircleText,
} from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetBody, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { AgentActionButton } from "@/components/agents/agent-action-button";
import { askBrain } from "@/lib/actions/agents";
import type { BrainAnswer } from "@/lib/agents/validate";
import { cn } from "@/lib/utils";

const EXAMPLES = ["מה הכי דחוף היום?", "אילו עסקאות תקועות ושוות הכי הרבה?", "מי הלקוחות שלא קנו אף פעם?", "איך ההכנסות החודש?"];

const GUIDE_GROUPS = [
  { title: "מצב העסק", questions: ["איך ההכנסות החודש לעומת החודש הקודם?", "כמה לקוחות חדשים היו לי החודש?"] },
  { title: "לקוח מסוים", questions: ["מי הלקוח שקנה הכי הרבה השנה?", "מי מהלקוחות הקבועים לא הגיע כבר הרבה זמן?"] },
  { title: "מה לעשות היום", questions: ["מה הכי דחוף היום?", "למי כדאי לשלוח הודעה היום?"] },
];

const GUIDE_SEEN_KEY = "bos:brain-guide-seen";
/** Turns sent back as context with each question (the server accepts up to 12). */
const HISTORY_TURNS = 8;

type Turn =
  | { id: number; role: "user"; text: string }
  | { id: number; role: "assistant"; answer: BrainAnswer }
  | { id: number; role: "error"; text: string; question: string };

const SOURCE_ICONS: Record<BrainAnswer["sources"][number]["type"], React.ElementType> = {
  customer: User,
  deal: Handshake,
  email: Envelope,
  insight: Lightbulb,
  metric: ChartBar,
};

function sourceHref(s: BrainAnswer["sources"][number]): string | null {
  if (!s.id) return null;
  if (s.type === "customer") return `/customers/${s.id}`;
  if (s.type === "deal") return `/deals?deal=${encodeURIComponent(s.id)}`;
  return null;
}

function SourceChip({ source }: { source: BrainAnswer["sources"][number] }) {
  const Icon = SOURCE_ICONS[source.type] ?? Info;
  const href = sourceHref(source);
  const body = (
    <>
      <Icon className="size-3.5 shrink-0" />
      <span className="truncate">{source.label}</span>
    </>
  );
  const base = "inline-flex max-w-full items-center gap-1 rounded-sm border border-border px-1.5 py-0.5 text-[11px]";
  return href ? (
    <Link href={href} className={cn(base, "text-foreground transition-colors hover:border-brand/40 hover:text-brand")}>
      {body}
    </Link>
  ) : (
    <span className={cn(base, "text-muted-foreground")}>{body}</span>
  );
}

function AnswerBubble({ answer }: { answer: BrainAnswer }) {
  return (
    <div className="border border-border bg-module px-3.5 py-3">
      <p className="text-[14px] leading-relaxed whitespace-pre-line">{answer.answer}</p>
      {answer.confidence === "low" && (
        <p className="mt-2 flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <Info className="size-3.5" />
          לא בטוח לגמרי. כדאי לבדוק את המספרים לפני שמחליטים.
        </p>
      )}
      {answer.sources.length > 0 && (
        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] text-muted-foreground">לפי:</span>
          {answer.sources.map((s, i) => (
            <SourceChip key={`${s.type}-${s.id ?? i}`} source={s} />
          ))}
        </div>
      )}
      {answer.actions.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5 border-t border-border pt-3">
          {answer.actions.map((a, i) => (
            <AgentActionButton key={`${a.type}-${i}`} action={a} primary={i === 0} />
          ))}
        </div>
      )}
    </div>
  );
}

function GuideSection({ icon: Icon, title, children }: { icon: React.ElementType; title: string; children: React.ReactNode }) {
  return (
    <section className="flex gap-3">
      <span className="grid size-8 shrink-0 place-items-center rounded-sm border border-brand/15 bg-brand-soft text-brand">
        <Icon className="size-4" />
      </span>
      <div className="min-w-0 flex-1 pt-1">
        <h3 className="text-[14px] font-semibold tracking-tight">{title}</h3>
        <div className="mt-1 text-[13px] leading-relaxed text-muted-foreground">{children}</div>
      </div>
    </section>
  );
}

function BrainGuide({ open, onOpenChange, onAsk }: { open: boolean; onOpenChange: (open: boolean) => void; onAsk: (q: string) => void }) {
  const sources = [
    { label: "נתוני העסק", note: "לקוחות, עסקאות, מכירות ומשימות", connected: true },
    { label: "תובנות הסוכנים", note: "מה שהסוכנים מצאו בריצה האחרונה", connected: true },
    { label: "מייל", note: "לא מחובר עדיין. בקרוב", connected: false },
  ];
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>איך המוח של העסק עובד</SheetTitle>
          <SheetDescription>שאלה בעברית רגילה, תשובה עם המספרים והשמות.</SheetDescription>
        </SheetHeader>
        <SheetBody className="space-y-6">
          <GuideSection icon={Brain} title="מה זה">
            המוח של העסק מכיר את כל מה שיש במערכת: לקוחות, עסקאות, מכירות ומשימות, וגם את מה שהסוכנים מצאו. שואלים אותו בעברית רגילה, והוא עונה עם
            המספרים והשמות.
          </GuideSection>

          <GuideSection icon={Lightbulb} title="מה הוא יודע">
            <ul className="mt-1 divide-y divide-border border border-border">
              {sources.map((s) => (
                <li key={s.label} className="flex items-center gap-2.5 px-3 py-2">
                  {s.connected ? <Check className="size-4 shrink-0 text-positive" /> : <Clock className="size-4 shrink-0 text-muted-foreground" />}
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-medium text-foreground">{s.label}</p>
                    <p className="text-[11px] text-muted-foreground">{s.note}</p>
                  </div>
                  <span className={cn("shrink-0 text-[11px]", s.connected ? "text-positive" : "text-muted-foreground")}>
                    {s.connected ? "מחובר" : "בקרוב"}
                  </span>
                </li>
              ))}
            </ul>
          </GuideSection>

          <GuideSection icon={ChatCircleText} title="מה אפשר לשאול">
            <p>לחץ על שאלה כדי לשאול אותה עכשיו.</p>
            <div className="mt-2 space-y-3">
              {GUIDE_GROUPS.map((g) => (
                <div key={g.title}>
                  <p className="text-[12px] font-medium text-foreground">{g.title}</p>
                  <div className="mt-1 flex flex-col items-start gap-1">
                    {g.questions.map((q) => (
                      <button
                        key={q}
                        type="button"
                        onClick={() => onAsk(q)}
                        className="cursor-pointer rounded-sm border border-border bg-module px-2.5 py-1 text-start text-xs text-foreground transition-colors hover:border-brand/40 hover:text-brand"
                      >
                        {q}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <p className="mt-2">אפשר גם לשאול על לקוח לפי שם, למשל: &quot;מה קורה עם דנה כהן?&quot;</p>
          </GuideSection>

          <GuideSection icon={HandPalm} title="מה הוא לא עושה">
            לא שולח הודעות ולא משנה כלום בלי שתאשר. לא ממציא: כשאין לו מידע הוא אומר.
          </GuideSection>

          <GuideSection icon={LockSimple} title="פרטיות">
            כדי לענות, השאלה והנתונים הרלוונטיים נשלחים לשירות AI. הם לא נשמרים שם ולא משמשים לאימון.
          </GuideSection>

          <p className="border-t border-border pt-4 text-xs text-muted-foreground">
            עד <span className="num">30</span> שאלות ביום. השיחה לא נשמרת: כשסוגרים את המסך היא נמחקת.
          </p>
        </SheetBody>
      </SheetContent>
    </Sheet>
  );
}

/** Needs no loader data: every answer is asked for on demand and kept only in this block. */
export function CompanyBrainView() {
  const [q, setQ] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [thinking, setThinking] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const nextId = useRef(0);
  const listRef = useRef<HTMLDivElement>(null);

  // First visit: open the guide once. Storage may be blocked; the block works the same without it.
  useEffect(() => {
    let seen = false;
    try {
      seen = window.localStorage.getItem(GUIDE_SEEN_KEY) === "1";
    } catch {
      seen = true; // can't remember it, so don't open it on every visit
    }
    if (!seen) setGuideOpen(true);
  }, []);

  function setGuide(open: boolean) {
    setGuideOpen(open);
    if (!open) {
      try {
        window.localStorage.setItem(GUIDE_SEEN_KEY, "1");
      } catch {
        // ignore
      }
    }
  }

  useEffect(() => {
    const list = listRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [turns, thinking]);

  async function ask(question: string) {
    const text = question.trim();
    if (text.length < 2 || thinking) return;
    const history = turns
      .filter((t): t is Exclude<Turn, { role: "error" }> => t.role !== "error")
      .slice(-HISTORY_TURNS)
      .map((t) => (t.role === "user" ? { role: "user" as const, content: t.text.slice(0, 2000) } : { role: "assistant" as const, content: t.answer.answer.slice(0, 2000) }));
    setTurns((ts) => [...ts, { id: nextId.current++, role: "user", text }]);
    setQ("");
    setThinking(true);
    try {
      const res = await askBrain({ question: text, history });
      setTurns((ts) => [
        ...ts,
        res.ok ? { id: nextId.current++, role: "assistant", answer: res.data } : { id: nextId.current++, role: "error", text: res.error, question: text },
      ]);
    } catch {
      setTurns((ts) => [...ts, { id: nextId.current++, role: "error", text: "משהו השתבש. נסה שוב.", question: text }]);
    } finally {
      setThinking(false);
    }
  }

  function askFromGuide(question: string) {
    setGuide(false);
    void ask(question);
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="min-w-0 text-[13px] text-muted-foreground">שאל בעברית רגילה. התשובה מגיעה עם המספרים והשמות מהעסק שלך.</p>
        <div className="flex shrink-0 items-center gap-1">
          {turns.length > 0 && (
            <Button size="xs" variant="ghost" className="text-muted-foreground" onClick={() => setTurns([])} disabled={thinking}>
              שיחה חדשה
            </Button>
          )}
          <Button size="xs" variant="outline" onClick={() => setGuide(true)}>
            <Question />
            איך זה עובד
          </Button>
        </div>
      </div>

      {(turns.length > 0 || thinking) && (
        <div ref={listRef} className="max-h-[28rem] space-y-2.5 overflow-y-auto" aria-live="polite">
          {turns.map((t) =>
            t.role === "user" ? (
              <div key={t.id} className="flex justify-start">
                <p className="max-w-[85%] border border-border bg-rail px-3 py-2 text-[14px] leading-relaxed whitespace-pre-line" dir="auto">
                  {t.text}
                </p>
              </div>
            ) : t.role === "assistant" ? (
              <AnswerBubble key={t.id} answer={t.answer} />
            ) : (
              <div key={t.id} className="flex flex-wrap items-center justify-between gap-2 border border-negative/25 bg-negative-soft px-3 py-2">
                <p className="text-[13px] text-negative">{t.text}</p>
                <Button size="xs" variant="outline" onClick={() => ask(t.question)} disabled={thinking}>
                  נסה שוב
                </Button>
              </div>
            ),
          )}
          {thinking && (
            <p role="status" className="flex items-center gap-2 border border-border bg-module px-3.5 py-3 text-[13px] text-muted-foreground">
              <CircleNotch className="size-4 shrink-0 animate-spin text-brand" />
              חושב על זה… בודק את הנתונים של העסק
            </p>
          )}
        </div>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void ask(q);
        }}
        className="flex items-center gap-2 border border-border-strong bg-module py-1.5 pe-1.5 ps-3.5 focus-within:ring-2 focus-within:ring-brand/30"
      >
        <Brain className="size-5 shrink-0 text-brand" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="שאל כל דבר על העסק שלך…"
          dir="auto"
          maxLength={1000}
          aria-label="שאלה למוח של העסק"
          className="h-10 min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-muted-foreground"
        />
        <Button type="submit" size="icon" variant="brand" disabled={thinking || q.trim().length < 2} aria-label="שאל">
          {thinking ? <CircleNotch className="animate-spin" /> : <ArrowUp />}
        </Button>
      </form>

      {turns.length === 0 && (
        <div className="flex flex-wrap gap-1.5">
          {EXAMPLES.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => ask(p)}
              disabled={thinking}
              className="cursor-pointer rounded-sm border border-border bg-module px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:border-brand/40 hover:text-foreground disabled:opacity-50"
            >
              {p}
            </button>
          ))}
        </div>
      )}

      <p className="text-[11px] text-muted-foreground">לא שולח ולא משנה כלום בלי שתאשר · עד <span className="num">30</span> שאלות ביום</p>

      <BrainGuide open={guideOpen} onOpenChange={setGuide} onAsk={askFromGuide} />
    </div>
  );
}
