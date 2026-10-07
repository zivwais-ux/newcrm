"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Bell, CircleNotch } from "@phosphor-icons/react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { listNotifications, markNotificationsRead, type NotificationRow } from "@/lib/actions/automations";
import { cn, formatNumber } from "@/lib/utils";
import { RelativeTime } from "./relative-time";

/** Bell in the top strip: what flows raised for you, newest first. */
export function NotificationBell({ initial }: { initial: NotificationRow[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState(initial);
  const [loading, setLoading] = useState(false);
  const [, start] = useTransition();

  // A server refresh (navigation, revalidation) brings a newer list.
  const [seen, setSeen] = useState(initial);
  if (seen !== initial) {
    setSeen(initial);
    setItems(initial);
  }

  const unread = items.filter((n) => !n.read_at).length;

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (!next) return;
    setLoading(true);
    listNotifications()
      .then(setItems)
      .catch(() => {})
      .finally(() => setLoading(false));
  }

  function markRead(ids: string[] | undefined) {
    const now = new Date().toISOString();
    const previous = items;
    setItems((list) => list.map((n) => (!n.read_at && (!ids || ids.includes(n.id)) ? { ...n, read_at: now } : n)));
    start(async () => {
      const res = await markNotificationsRead(ids);
      if (!res.ok) {
        setItems(previous);
        toast.error(res.error);
      }
    });
  }

  function openItem(n: NotificationRow) {
    if (!n.read_at) markRead([n.id]);
    if (n.link) {
      setOpen(false);
      router.push(n.link);
    }
  }

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={unread ? `התראות, ${formatNumber(unread)} חדשות` : "התראות"}
          className="relative grid size-9 shrink-0 place-items-center text-muted-foreground transition-colors hover:bg-muted hover:text-foreground active:translate-y-px cursor-pointer data-[state=open]:bg-muted data-[state=open]:text-foreground"
        >
          <Bell className="size-5" weight={open ? "fill" : "regular"} />
          {unread > 0 && (
            <span className="num absolute -top-0.5 -end-0.5 grid h-4 min-w-4 place-items-center rounded-sm bg-brand px-1 text-[10px] leading-none font-medium text-white">
              {unread > 99 ? "99+" : formatNumber(unread)}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={8} className="w-80 p-0">
        <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
          <p className="flex items-center gap-1.5 text-sm font-semibold">
            התראות
            {loading && <CircleNotch className="size-3.5 animate-spin text-muted-foreground" aria-label="טוען" />}
          </p>
          {unread > 0 && (
            <button
              type="button"
              onClick={() => markRead(undefined)}
              className="text-xs font-medium text-brand hover:underline cursor-pointer"
            >
              סמן הכל כנקרא
            </button>
          )}
        </div>
        {items.length ? (
          <ul className="max-h-[min(420px,60vh)] overflow-y-auto">
            {items.map((n) => (
              <li key={n.id} className="border-t border-border first:border-t-0">
                <button
                  type="button"
                  onClick={() => openItem(n)}
                  className={cn(
                    "flex w-full items-start gap-2.5 px-3 py-2.5 text-start transition-colors hover:bg-muted/60 cursor-pointer",
                    !n.link && n.read_at && "cursor-default",
                  )}
                >
                  <span
                    className={cn("mt-1.5 size-1.5 shrink-0 rounded-full", n.read_at ? "bg-transparent" : "bg-brand")}
                    aria-hidden
                  />
                  <span className="min-w-0 flex-1">
                    <span className={cn("block text-[13px] leading-snug", n.read_at ? "text-muted-foreground" : "font-medium text-foreground")}>
                      {n.title}
                    </span>
                    {n.body && <span className="mt-0.5 line-clamp-2 block text-xs text-muted-foreground">{n.body}</span>}
                    <RelativeTime value={n.created_at} className="num mt-0.5 block text-[11px] text-muted-foreground" />
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <div className="px-4 py-8 text-center">
            <p className="text-sm font-medium">אין התראות</p>
            <p className="mt-1 text-xs text-muted-foreground">כשזרימה צריכה את תשומת הלב שלך, תופיע כאן התראה.</p>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
