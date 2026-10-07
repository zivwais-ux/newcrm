"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { toast } from "sonner";
import { FlowArrow, PaperPlaneTilt, WhatsappLogo } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Ltr } from "@/components/ui/ltr";
import { dismissOutbox, markOutboxSent, type OutboxRow } from "@/lib/actions/automations";
import { whatsAppLink } from "@/lib/whatsapp";
import { cn, formatNumber } from "@/lib/utils";
import { RelativeTime } from "./relative-time";

/** WhatsApp's own green, used only on the WhatsApp action (same as WhatsAppButton). */
const WA = "text-[#128c4b]";

/**
 * Messages that flows prepared. Nothing is sent automatically: one tap opens WhatsApp
 * with the message ready, and the row is marked as sent.
 */
export function OutboxList({
  rows: initial,
  compact = false,
  limit,
  total,
}: {
  rows: OutboxRow[];
  compact?: boolean;
  /** Show at most this many rows. */
  limit?: number;
  /** How many are waiting in total (when `rows` is only the first page). */
  total?: number;
}) {
  const router = useRouter();
  const reduce = useReducedMotion();
  const [, start] = useTransition();
  const [hidden, setHidden] = useState<Set<string>>(() => new Set());

  const visible = initial.filter((r) => !hidden.has(r.id));
  const shown = limit ? visible.slice(0, limit) : visible;
  const waiting = Math.max(visible.length, (total ?? initial.length) - (initial.length - visible.length));
  const more = waiting - shown.length;

  const hide = (id: string) => setHidden((s) => new Set(s).add(id));
  const unhide = (id: string) =>
    setHidden((s) => {
      const next = new Set(s);
      next.delete(id);
      return next;
    });

  function send(row: OutboxRow) {
    const link = whatsAppLink(row.phone, row.body);
    if (!link) return;
    // Open synchronously inside the click so the browser doesn't block the new tab.
    window.open(link, "_blank", "noopener,noreferrer");
    hide(row.id);
    start(async () => {
      const res = await markOutboxSent(row.id);
      if (!res.ok) {
        unhide(row.id);
        toast.error(res.error);
        return;
      }
      router.refresh();
    });
  }

  function skip(row: OutboxRow) {
    hide(row.id);
    start(async () => {
      const res = await dismissOutbox(row.id);
      if (!res.ok) {
        unhide(row.id);
        toast.error(res.error);
        return;
      }
      router.refresh();
    });
  }

  if (!shown.length) {
    return (
      <EmptyState
        compact
        icon={<PaperPlaneTilt />}
        title="אין הודעות שמחכות"
        description="כשזרימה מכינה הודעת WhatsApp, היא מחכה כאן ללחיצה אחת שלך. שום הודעה לא נשלחת לבד."
        action={
          <Button asChild size="sm" variant="outline">
            <Link href="/automations">
              <FlowArrow />
              לזרימות
            </Link>
          </Button>
        }
      />
    );
  }

  return (
    <div>
      <ul>
        <AnimatePresence initial={false}>
          {shown.map((row) => {
            const canSend = Boolean(whatsAppLink(row.phone));
            return (
              <motion.li
                key={row.id}
                layout={!reduce}
                initial={false}
                exit={reduce ? { opacity: 0 } : { opacity: 0, height: 0, transition: { duration: 0.18 } }}
                className="overflow-hidden border-t border-border first:border-t-0"
              >
                <div
                  className={cn(
                    "flex items-start gap-3",
                    compact ? "py-2" : "py-2.5",
                  )}
                >
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-baseline gap-x-2 text-sm">
                      <span className="truncate font-medium">{row.name || "ללא שם"}</span>
                      <Ltr className="num text-xs text-muted-foreground">{row.phone}</Ltr>
                    </p>
                    <p className="mt-0.5 line-clamp-2 text-[13px] leading-snug whitespace-pre-line text-muted-foreground">{row.body}</p>
                    <RelativeTime value={row.created_at} className="mt-0.5 block text-[11px] text-muted-foreground num" />
                  </div>
                  <div className="flex shrink-0 items-center gap-0.5 pt-0.5">
                    <Button
                      size={compact ? "xs" : "sm"}
                      variant="outline"
                      className={cn(canSend && WA)}
                      disabled={!canSend}
                      title={canSend ? undefined : "מספר הטלפון לא תקין"}
                      onClick={() => send(row)}
                      aria-label={`שלח ב-WhatsApp ל${row.name || row.phone}`}
                    >
                      <WhatsappLogo />
                      {canSend ? "שלח" : "מספר לא תקין"}
                    </Button>
                    <Button size="xs" variant="ghost" className="text-muted-foreground" onClick={() => skip(row)}>
                      דלג
                    </Button>
                  </div>
                </div>
              </motion.li>
            );
          })}
        </AnimatePresence>
      </ul>
      {more > 0 && (
        <p className="mt-1 border-t border-border pt-2 text-xs text-muted-foreground">
          ועוד <span className="num">{formatNumber(more)}</span> הודעות שמחכות
        </p>
      )}
    </div>
  );
}
