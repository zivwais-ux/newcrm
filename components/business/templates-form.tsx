"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { CircleNotch, Plus, Trash } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { saveTemplates } from "@/lib/actions/whatsapp";
import type { MessageTemplate } from "@/lib/whatsapp";

/** Edit the ready WhatsApp messages. Placeholders are filled per customer. */
export function TemplatesForm({ initial, canManage }: { initial: MessageTemplate[]; canManage: boolean }) {
  const [items, setItems] = useState(initial.map((t) => ({ name: t.name, body: t.body })));
  const [pending, start] = useTransition();

  function update(i: number, patch: Partial<{ name: string; body: string }>) {
    setItems((list) => list.map((t, j) => (j === i ? { ...t, ...patch } : t)));
  }

  return (
    <div className="space-y-4">
      <p className="text-[13px] leading-relaxed text-muted-foreground">
        אפשר להשתמש ב־<code className="rounded bg-muted px-1">{"{שם}"}</code> (השם הפרטי של הלקוח),{" "}
        <code className="rounded bg-muted px-1">{"{עסק}"}</code> ו־<code className="rounded bg-muted px-1">{"{שירות}"}</code> — הם יתמלאו לבד.
      </p>
      <ul className="space-y-3">
        {items.map((t, i) => (
          <li key={i} className="space-y-2 rounded-lg border bg-muted/30 p-3">
            <div className="flex items-center gap-2">
              <Input value={t.name} onChange={(e) => update(i, { name: e.target.value })} disabled={!canManage} placeholder="שם התבנית" className="h-8 flex-1 text-[13px] font-medium" maxLength={60} />
              {canManage && items.length > 1 && (
                <Button variant="ghost" size="icon-sm" onClick={() => setItems((l) => l.filter((_, j) => j !== i))} aria-label="מחק תבנית">
                  <Trash className="text-muted-foreground" />
                </Button>
              )}
            </div>
            <Textarea dir="auto" value={t.body} onChange={(e) => update(i, { body: e.target.value })} disabled={!canManage} className="min-h-20 text-[13px]" maxLength={1000} />
          </li>
        ))}
      </ul>
      {canManage && (
        <div className="flex flex-wrap justify-between gap-2">
          <Button variant="outline" size="sm" onClick={() => setItems((l) => [...l, { name: "", body: "היי {שם}, " }])} disabled={items.length >= 20}>
            <Plus />
            תבנית חדשה
          </Button>
          <Button
            size="sm"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const res = await saveTemplates(items);
                if (res.ok) toast.success("התבניות נשמרו");
                else toast.error(res.error);
              })
            }
          >
            {pending && <CircleNotch className="animate-spin" />}
            שמור תבניות
          </Button>
        </div>
      )}
    </div>
  );
}
