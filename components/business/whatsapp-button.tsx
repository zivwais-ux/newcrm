"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { PaperPlaneTilt, WhatsappLogo } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useWorkspace } from "@/components/layout/workspace-provider";
import { logWhatsApp } from "@/lib/actions/whatsapp";
import { DEFAULT_TEMPLATES, fillTemplate, toWhatsAppNumber, whatsAppLink } from "@/lib/whatsapp";
import { cn } from "@/lib/utils";

/** WhatsApp's own green, used only for this action so it's instantly recognizable. */
const WA = "text-[#128c4b]";

/**
 * Opens a WhatsApp chat with a ready Hebrew message (from the business's templates),
 * and records it in the customer's history. Works on phone (app) and desktop (WhatsApp Web).
 */
export function WhatsAppButton({
  phone,
  name,
  customerId,
  dealId,
  service,
  template,
  variant = "icon",
  label = "WhatsApp",
  className,
}: {
  phone: string | null | undefined;
  name: string;
  customerId?: string | null;
  dealId?: string | null;
  service?: string | null;
  /** Name of the template to preselect (e.g. "לא ראינו אותך מזמן"). */
  template?: string;
  variant?: "icon" | "button";
  label?: string;
  className?: string;
}) {
  const router = useRouter();
  const { org, templates: saved } = useWorkspace();
  const templates = saved?.length ? saved : DEFAULT_TEMPLATES;
  const number = toWhatsAppNumber(phone);
  const [open, setOpen] = useState(false);
  const [chosen, setChosen] = useState(templates[0]);
  const [text, setText] = useState("");
  const [pending, start] = useTransition();

  const fill = (body: string) => fillTemplate(body, { name, business: org.name, service });

  function openDialog() {
    const first = templates.find((t) => t.name === template) ?? templates[0];
    setChosen(first);
    setText(fill(first.body));
    setOpen(true);
  }

  function send() {
    const link = whatsAppLink(phone, text.trim());
    if (!link) return;
    window.open(link, "_blank", "noopener,noreferrer");
    setOpen(false);
    start(async () => {
      const res = await logWhatsApp({ customerId: customerId ?? null, dealId: dealId ?? null, template: chosen.name, text: text.trim() });
      if (res.ok) {
        toast.success("נרשם בהיסטוריה של " + name);
        router.refresh();
      }
    });
  }

  if (!number) {
    if (variant === "icon") {
      return (
        <Tooltip>
          <TooltipTrigger asChild>
            <span className={cn("inline-grid size-8 place-items-center rounded-lg text-zinc-300", className)} aria-label="אין מספר טלפון">
              <WhatsappLogo className="size-4" />
            </span>
          </TooltipTrigger>
          <TooltipContent>אין מספר טלפון ללקוח הזה</TooltipContent>
        </Tooltip>
      );
    }
    return (
      <Button variant="outline" size="sm" disabled className={className}>
        <WhatsappLogo />
        אין טלפון
      </Button>
    );
  }

  return (
    <>
      {variant === "icon" ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                openDialog();
              }}
              className={cn("inline-grid size-8 place-items-center rounded-lg transition-colors hover:bg-[#25d366]/10 cursor-pointer", WA, className)}
              aria-label={`שלח WhatsApp ל${name}`}
            >
              <WhatsappLogo className="size-4" />
            </button>
          </TooltipTrigger>
          <TooltipContent>שלח WhatsApp ל{name}</TooltipContent>
        </Tooltip>
      ) : (
        <Button variant="outline" size="sm" onClick={openDialog} className={cn(WA, className)} disabled={pending}>
          <WhatsappLogo />
          {label}
        </Button>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>הודעת WhatsApp ל{name}</DialogTitle>
            <DialogDescription>בחר הודעה מוכנה ותקן אם צריך. WhatsApp ייפתח עם ההודעה — רק ללחוץ שלח.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-wrap gap-1.5">
            {templates.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => {
                  setChosen(t);
                  setText(fill(t.body));
                }}
                className={cn(
                  "rounded-sm border px-3 py-1 text-xs font-medium transition-colors cursor-pointer",
                  chosen.id === t.id ? "border-[#25d366]/40 bg-[#25d366]/10 text-[#0b6b39]" : "text-muted-foreground hover:bg-accent hover:text-foreground",
                )}
              >
                {t.name}
              </button>
            ))}
          </div>
          <Textarea dir="auto" value={text} onChange={(e) => setText(e.target.value)} className="min-h-32 text-sm" aria-label="תוכן ההודעה" />
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              ביטול
            </Button>
            <Button onClick={send} disabled={!text.trim()} className="bg-[#25d366] text-white hover:bg-[#1fb958]">
              <PaperPlaneTilt className="rtl:-scale-x-100" />
              פתח ב-WhatsApp
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
