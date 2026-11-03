"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowSquareOut, Check, CircleNotch, FlowArrow, ListPlus, WhatsappLogo } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { approveAgentAction, markInsight } from "@/lib/actions/agents";
import { getCustomerPhone } from "@/lib/actions/agent-ui";
import { logWhatsApp } from "@/lib/actions/whatsapp";
import type { AgentAction } from "@/lib/agents/validate";
import { whatsAppLink } from "@/lib/whatsapp";
import { cn } from "@/lib/utils";

/** Where each "open_view" suggestion takes the user. */
export const AGENT_VIEW_HREF: Record<Extract<AgentAction, { type: "open_view" }>["view"], string> = {
  customers_at_risk: "/customers",
  lapsed_customers: "/customers",
  never_bought: "/customers",
  stuck_deals: "/deals",
  pipeline: "/deals",
  revenue: "/transactions",
};

const ICONS = {
  create_task: ListPlus,
  create_flow: FlowArrow,
  prepare_whatsapp: WhatsappLogo,
  open_view: ArrowSquareOut,
} as const;

/** WhatsApp's own green, used only on the WhatsApp action (same as the outbox). */
const WA = "text-[#128c4b]";

/**
 * One suggested action from an agent or the Brain. Nothing happens until the person taps it:
 * tasks and flows are created on the server, WhatsApp opens with the message ready, views open.
 *
 * With an insight, `onHandled` fires as soon as the tap is accepted (the card can leave right away)
 * and `onRestore` if the action then fails. Without one, the button itself shows that it was done.
 */
export function AgentActionButton({
  action,
  insightId,
  primary = false,
  onHandled,
  onRestore,
}: {
  action: AgentAction;
  insightId?: string | null;
  primary?: boolean;
  onHandled?: () => void;
  onRestore?: () => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const Icon = ICONS[action.type];

  const handled = () => {
    if (onHandled) onHandled();
    else setDone(true);
  };
  const failed = (message: string) => {
    onRestore?.();
    setDone(false);
    toast.error(message);
  };

  async function run() {
    if (action.type === "open_view") {
      router.push(AGENT_VIEW_HREF[action.view]);
      return;
    }

    if (action.type === "prepare_whatsapp") {
      // Open the tab inside the click so the browser allows it; point it at WhatsApp once we have the number.
      const win = window.open("", "_blank");
      setBusy(true);
      const res = await getCustomerPhone(action.customer_id);
      const link = res.ok ? whatsAppLink(res.data.phone, action.text) : null;
      if (!link) {
        win?.close();
        setBusy(false);
        toast.error(res.ok ? "ללקוח הזה אין מספר טלפון תקין ל-WhatsApp." : res.error);
        return;
      }
      if (win) {
        win.opener = null;
        win.location.href = link;
      } else {
        window.open(link, "_blank", "noopener,noreferrer");
      }
      handled();
      setBusy(false);
      await logWhatsApp({ customerId: action.customer_id, template: "הצעה של סוכן", text: action.text });
      if (insightId) {
        const marked = await markInsight(insightId, "done");
        if (!marked.ok) toast.error(marked.error);
      }
      router.refresh();
      return;
    }

    // create_task / create_flow run on the server.
    setBusy(true);
    if (action.type === "create_task") handled();
    const res = await approveAgentAction(action, insightId ?? null);
    setBusy(false);
    if (!res.ok) return failed(res.error);
    if (action.type === "create_task") {
      toast.success("המשימה נוצרה. היא מחכה ברשימת המשימות של היום.");
      router.refresh();
      return;
    }
    handled();
    toast.success("הזרימה נוצרה. היא כבויה עד שתבדוק ותפעיל אותה.");
    if (res.data.href) router.push(res.data.href);
    else router.refresh();
  }

  const isWhatsApp = action.type === "prepare_whatsapp";
  return (
    <Button
      size="xs"
      variant={primary && !isWhatsApp ? "brand" : "outline"}
      className={cn(isWhatsApp && WA)}
      disabled={busy || done}
      onClick={run}
    >
      {busy ? (
        <CircleNotch className="animate-spin" />
      ) : done ? (
        <Check />
      ) : (
        <Icon className={cn(action.type === "open_view" && "rtl:-scale-x-100")} />
      )}
      {action.label}
    </Button>
  );
}
