"use client";

import { OutboxList } from "@/components/automations/outbox-list";
import type { OutboxData } from "@/lib/components/loaders";
import { formatNumber } from "@/lib/utils";
import type { ViewProps } from "../shared";

export function OutboxView({ data }: ViewProps<OutboxData>) {
  return (
    <div className="space-y-2">
      {data.total > 0 && (
        <p className="text-xs text-muted-foreground">
          <span className="num font-medium text-foreground">{formatNumber(data.total)}</span> מחכות ללחיצה אחת · WhatsApp ייפתח עם ההודעה מוכנה
        </p>
      )}
      <OutboxList rows={data.rows} total={data.total} />
    </div>
  );
}
