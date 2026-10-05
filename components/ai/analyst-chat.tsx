"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowUp, Database, ListPlus, Loader2, Sparkles, Upload, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { BulkTaskDialog } from "@/components/business/bulk-task-dialog";
import { RichText } from "./rich-text";
import type { AnalystAction } from "@/lib/ai/analyst-tools";

interface Message {
  role: "user" | "assistant";
  content: string;
  actions?: AnalystAction[];
  toolsUsed?: string[];
  notice?: string | null;
  error?: boolean;
}

/** Starter questions shown before the first message. */
const CHAT_PROMPTS = [
  "כמה הכנסתי החודש?",
  "אילו לקוחות עלולים לעזוב?",
  "מה השירות הכי רווחי?",
  "למי כדאי לחזור השבוע?",
  "למה ההכנסות ירדו?",
  "אילו עסקאות תקועות?",
];

const TOOL_LABELS: Record<string, string> = {
  get_business_overview: "תמונת מצב של העסק",
  compare_periods: "השוואת תקופות",
  get_revenue_trend: "הכנסות לאורך זמן",
  get_revenue_by_service: "הכנסות לפי שירות",
  get_top_customers: "לקוחות מובילים",
  get_overdue_regulars: "קצב החזרה של לקוחות",
  get_customers_at_risk: "לקוחות בסיכון",
  get_deals_at_risk: "עסקאות תקועות",
  get_pipeline_summary: "עסקאות בתהליך",
  search_customers: "חיפוש לקוחות",
  get_tasks: "משימות",
};

function ActionButton({ action }: { action: AnalystAction }) {
  const [open, setOpen] = useState(false);
  if (action.type === "view_customers" && action.customerIds?.length) {
    const href = `/customers?ids=${action.customerIds.join(",")}&title=${encodeURIComponent(action.title ?? action.label)}`;
    return (
      <Button asChild size="sm" variant="outline" className="rounded-full">
        <Link href={href}>
          <Users />
          {action.label}
        </Link>
      </Button>
    );
  }
  if (action.type === "create_tasks") {
    return (
      <>
        <Button size="sm" variant="outline" className="rounded-full" onClick={() => setOpen(true)}>
          <ListPlus />
          {action.label}
        </Button>
        {open && (
          <BulkTaskDialog
            open
            onOpenChange={setOpen}
            customerIds={action.customerIds}
            dealIds={action.dealIds}
            defaultTitle={action.taskTitle ?? "לחזור ללקוח"}
          />
        )}
      </>
    );
  }
  return null;
}

export function AnalystChat({ initialQuestion, hasData }: { initialQuestion: string | null; hasData: boolean }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const asked = useRef(false);
  const bottom = useRef<HTMLDivElement>(null);

  async function ask(question: string) {
    const q = question.trim();
    if (!q || loading) return;
    const history: Message[] = [...messages, { role: "user", content: q }];
    setMessages(history);
    setInput("");
    setLoading(true);
    try {
      localStorage.setItem("bos.askedAI", "1");
    } catch {
      /* ignore */
    }
    try {
      const res = await fetch("/api/ai/analyst", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history.filter((m) => !m.error).map(({ role, content }) => ({ role, content })) }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setMessages((m) => [...m, { role: "assistant", content: json.answer, actions: json.actions, toolsUsed: json.toolsUsed, notice: json.notice }]);
    } catch (e) {
      setMessages((m) => [...m, { role: "assistant", content: (e as Error).message || "היועץ לא הצליח לענות כרגע. נסה שוב.", error: true }]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (initialQuestion && !asked.current) {
      asked.current = true;
      ask(initialQuestion);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialQuestion]);

  useEffect(() => bottom.current?.scrollIntoView({ behavior: "smooth", block: "end" }), [messages, loading]);

  return (
    <div className="mx-auto flex min-h-[calc(100vh-3.5rem)] w-full max-w-3xl flex-col px-4 py-6 sm:px-8 sm:py-8">
      <div className="mb-5 flex items-center gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-soft text-brand ring-1 ring-brand/10">
          <Sparkles className="size-5" />
        </span>
        <div className="min-w-0">
          <h1 className="text-[24px] font-bold leading-tight tracking-tight">היועץ החכם</h1>
          <p className="text-[14px] text-muted-foreground">התשובות מגיעות מהלקוחות, המכירות והעסקאות שלך — לא מידע כללי.</p>
        </div>
      </div>

      <Card className="flex flex-1 flex-col overflow-hidden">
        <div className="flex-1 px-4 py-5 sm:px-6">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center py-10 text-center">
              <h2 className="text-[20px] font-semibold tracking-tight">מה תרצה לדעת על העסק?</h2>
              <p className="mt-1.5 max-w-md text-[14px] text-muted-foreground">בחר שאלה או כתוב שאלה משלך, בשפה פשוטה.</p>
              {!hasData && (
                <div className="mt-6 flex max-w-md flex-col items-center gap-3 rounded-xl border border-dashed px-5 py-4 text-[14px] text-muted-foreground">
                  <p>עדיין אין נתוני עסק. העלה קובץ לקוחות או מכירות, והיועץ יענה לפיו.</p>
                  <Button asChild size="sm" variant="brand">
                    <Link href="/data/import">
                      <Upload />
                      העלה קובץ
                    </Link>
                  </Button>
                </div>
              )}
              <div className="mt-8 flex flex-wrap justify-center gap-2">
                {CHAT_PROMPTS.map((p) => (
                  <Button key={p} type="button" variant="outline" size="sm" className="rounded-full text-zinc-600 hover:text-foreground" onClick={() => ask(p)}>
                    {p}
                  </Button>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              {messages.map((m, i) =>
                m.role === "user" ? (
                  <div key={i} className="flex justify-start">
                    <p dir="auto" className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-ss-md bg-zinc-100 px-4 py-2.5 text-[15px] shadow-xs">
                      {m.content}
                    </p>
                  </div>
                ) : (
                  <div key={i} className="flex justify-end gap-2.5">
                    <div className="min-w-0 max-w-[90%] space-y-2.5">
                      <div className="rounded-2xl rounded-se-md border bg-background px-4 py-3 shadow-xs">
                        {m.error ? <p className="text-[15px] text-negative">{m.content}</p> : <RichText text={m.content} />}
                      </div>
                      {m.actions && m.actions.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                          {m.actions.map((a, j) => (
                            <ActionButton key={j} action={a} />
                          ))}
                        </div>
                      )}
                      {m.toolsUsed && m.toolsUsed.length > 0 && (
                        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <Database className="size-3 shrink-0" />
                          מבוסס על הנתונים שלך: {m.toolsUsed.map((t) => TOOL_LABELS[t] ?? t).join(", ")}
                        </p>
                      )}
                      {m.notice && <p className="text-xs text-muted-foreground">{m.notice}</p>}
                    </div>
                    <span className="mt-1 grid size-7 shrink-0 place-items-center rounded-lg bg-brand-soft text-brand">
                      <Sparkles className="size-3.5" />
                    </span>
                  </div>
                ),
              )}
              {loading && (
                <div className="flex items-center justify-end gap-2.5 text-sm text-muted-foreground">
                  בודק את הנתונים שלך…
                  <span className="grid size-7 place-items-center rounded-lg bg-brand-soft text-brand">
                    <Loader2 className="size-3.5 animate-spin" />
                  </span>
                </div>
              )}
              <div ref={bottom} />
            </div>
          )}
        </div>

        <div className="sticky bottom-0 border-t bg-surface/95 px-3 py-3 backdrop-blur sm:px-4">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              ask(input);
            }}
            className="flex items-center gap-2 rounded-xl border bg-background py-1.5 pe-1.5 ps-3.5 shadow-xs focus-within:ring-2 focus-within:ring-ring/30"
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="שאל כל שאלה על העסק…"
              dir="auto"
              className="h-9 flex-1 bg-transparent text-[15px] outline-none placeholder:text-muted-foreground"
              maxLength={1000}
              aria-label="שאלה ליועץ"
            />
            <Button type="submit" size="icon-sm" disabled={!input.trim() || loading} aria-label="שלח">
              <ArrowUp />
            </Button>
          </form>
        </div>
      </Card>
      <p className="mt-3 text-center text-[12px] text-muted-foreground">היועץ קורא וממליץ. הוא אף פעם לא משנה את הנתונים שלך בלי אישור שלך.</p>
    </div>
  );
}
