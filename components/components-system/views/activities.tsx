"use client";

import Link from "next/link";
import { CalendarDots } from "@phosphor-icons/react";
import { EmptyState } from "@/components/ui/empty-state";
import { ActivityItem } from "@/components/business/activity-list";
import { NewRecordButton } from "@/components/business/record-form";
import type { ActivitiesData } from "@/lib/components/loaders";
import { SectionLabel, type ViewProps } from "../shared";

export function ActivitiesView({ data }: ViewProps<ActivitiesData>) {
  const sections = data.upcomingFirst
    ? [
        { label: "היום ובהמשך", items: data.upcoming },
        { label: "לפני היום", items: data.recent },
      ]
    : [
        { label: "לפני היום", items: data.recent },
        { label: "היום ובהמשך", items: data.upcoming },
      ];
  const empty = !data.upcoming.length && !data.recent.length;
  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <NewRecordButton entity="activities" variant="outline" size="xs">
          הוסף פעילות
        </NewRecordButton>
      </div>
      {empty ? (
        <EmptyState
          compact
          icon={<CalendarDots />}
          title="עדיין אין פעילות"
          description="כאן יופיעו התורים, השיחות והביקורים שלך — מה שמחכה היום ובהמשך, ומה שהיה לאחרונה. רשום את הפעילות הראשונה."
          action={
            <NewRecordButton entity="activities" size="sm">
              הוסף פעילות
            </NewRecordButton>
          }
        />
      ) : (
        sections
          .filter((s) => s.items.length)
          .map((s) => (
            <div key={s.label}>
              <SectionLabel className="mb-1">{s.label}</SectionLabel>
              {s.items.map((a) => (
                <ActivityItem key={a.id} activity={a} />
              ))}
            </div>
          ))
      )}
      {!empty && (
        <Link href="/activities" className="inline-block text-xs font-medium text-muted-foreground hover:text-foreground">
          לכל הפעילות ←
        </Link>
      )}
    </div>
  );
}
