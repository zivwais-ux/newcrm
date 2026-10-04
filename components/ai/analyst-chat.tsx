"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowUp, Database, ListPlus, Loader2, Sparkles, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BulkTaskDialog } from "@/components/business/bulk-task-dialog";
import { SUGGESTED_PROMPTS } from "@/components/components-system/views/ai-analyst";
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

const TOOL_LABELS: Record<string, string> = {
  get_business_overview: "business overview",
  compare_periods: "period comparison",
  get_revenue_trend: "revenue trend",
  get_revenue_by_service: "revenue by service",
  get_top_customers: "top customers",
  get_overdue_regulars: "purchase rhythms",
  get_customers_at_risk: "customer risk",
  get_deals_at_risk: "deal risk",
  get_pipeline_summary: "pipeline",
  search_customers: "customer search",
};

function ActionButton({ action }: { action: AnalystAction }) {
  const [open, setOpen] = useState(false);
  if (action.type === "view_customers" && action.customerIds?.length) {
    const href = `/customers?ids=${action.customerIds.join(",")}&title=${encodeURIComponent(action.title ?? action.label)}`;
    return (
      <Button asChild size="sm" variant="outline">
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
        <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
          <ListPlus />
          {action.label}
        </Button>
        {open && (
          <BulkTaskDialog
            open
            onOpenChange={setOpen}
            customerIds={action.customerIds}
            dealIds={action.dealIds}
            defaultTitle={action.taskTitle ?? "Follow up"}
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
      const res = await fetch("/api/ai/analyst", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history.filter((m) => !m.error).map(({ role, content }) => ({ role, content })) }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setMessages((m) => [...m, { role: "assistant", content: json.answer, actions: json.actions, toolsUsed: json.toolsUsed, notice: json.notice }]);
    } catch (e) {
      setMessages((m) => [...m, { role: "assistant", content: (e as Error).message || "The analyst couldn't answer right now. Please try again.", error: true }]);
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
    <div className="flex min-h-[calc(100vh-3.5rem)] flex-col">
      <div className="mx-auto w-full max-w-3xl flex-1 px-4 pt-10 pb-6 sm:px-8">
        {messages.length === 0 ? (
          <div className="pt-[8vh] text-center">
            <Sparkles className="mx-auto size-6 text-brand" />
            <h1 className="mt-4 text-[26px] font-semibold tracking-tight">Ask your business</h1>
            <p className="mt-2 text-[15px] text-muted-foreground">
              Answers come from your own customers, sales and deals — not general knowledge.
            </p>
            {!hasData && (
              <p className="mx-auto mt-6 max-w-md rounded-md border border-dashed px-4 py-3 text-sm text-muted-foreground">
                There&apos;s no business data yet.{" "}
                <Link href="/data/import" className="font-medium text-foreground underline">
                  Import a file
                </Link>{" "}
                and the analyst will answer from it.
              </p>
            )}
            <div className="mt-8 flex flex-wrap justify-center gap-2">
              {SUGGESTED_PROMPTS.map((p) => (
                <button
                  key={p}
                  onClick={() => ask(p)}
                  className="rounded-full border bg-surface px-3 py-1.5 text-sm text-zinc-600 transition-colors hover:border-zinc-300 hover:text-foreground cursor-pointer"
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-8">
            {messages.map((m, i) =>
              m.role === "user" ? (
                <div key={i} className="flex justify-end">
                  <p className="max-w-[80%] rounded-lg bg-zinc-100 px-3.5 py-2 text-[15px]">{m.content}</p>
                </div>
              ) : (
                <div key={i} className="flex gap-3">
                  <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-md bg-brand-soft text-brand">
                    <Sparkles className="size-3.5" />
                  </span>
                  <div className="min-w-0 flex-1 space-y-3">
                    {m.error ? <p className="text-[15px] text-negative">{m.content}</p> : <RichText text={m.content} />}
                    {m.actions && m.actions.length > 0 && (
                      <div className="flex flex-wrap gap-2 pt-1">
                        {m.actions.map((a, j) => (
                          <ActionButton key={j} action={a} />
                        ))}
                      </div>
                    )}
                    {m.toolsUsed && m.toolsUsed.length > 0 && (
                      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Database className="size-3" />
                        Based on your data: {m.toolsUsed.map((t) => TOOL_LABELS[t] ?? t).join(", ")}
                      </p>
                    )}
                    {m.notice && <p className="text-xs text-muted-foreground">{m.notice}</p>}
                  </div>
                </div>
              ),
            )}
            {loading && (
              <div className="flex items-center gap-3 text-sm text-muted-foreground">
                <span className="grid size-7 place-items-center rounded-md bg-brand-soft text-brand">
                  <Loader2 className="size-3.5 animate-spin" />
                </span>
                Analyzing your data…
              </div>
            )}
            <div ref={bottom} />
          </div>
        )}
      </div>
      <div className="sticky bottom-0 border-t bg-background/90 backdrop-blur">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            ask(input);
          }}
          className="mx-auto flex w-full max-w-3xl items-center gap-2 px-4 py-4 sm:px-8"
        >
          <div className="flex flex-1 items-center gap-2 rounded-lg border bg-surface py-1.5 pr-1.5 pl-3.5 focus-within:ring-2 focus-within:ring-ring/30">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask anything about your business…"
              className="h-8 flex-1 bg-transparent text-[15px] outline-none placeholder:text-muted-foreground"
              maxLength={1000}
              aria-label="Ask a question"
            />
            <Button type="submit" size="icon-sm" disabled={!input.trim() || loading} aria-label="Send">
              <ArrowUp />
            </Button>
          </div>
        </form>
        <p className="mx-auto -mt-2 max-w-3xl px-4 pb-3 text-center text-[11px] text-muted-foreground sm:px-8">
          The analyst reads and recommends. It never changes your data without your confirmation.
        </p>
      </div>
    </div>
  );
}
