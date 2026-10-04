"use client";

import { CalendarClock } from "lucide-react";
import { EmptyState } from "@/components/business/empty-state";
import { ActivityItem } from "@/components/business/activity-list";
import { NewRecordButton } from "@/components/business/record-form";
import type { ActivitiesData } from "@/lib/components/loaders";
import { SectionLabel, type ViewProps } from "../shared";

export function ActivitiesView({ data }: ViewProps<ActivitiesData>) {
  const sections = data.upcomingFirst
    ? [
        { label: "Upcoming", items: data.upcoming },
        { label: "Recent", items: data.recent },
      ]
    : [
        { label: "Recent", items: data.recent },
        { label: "Upcoming", items: data.upcoming },
      ];
  const empty = !data.upcoming.length && !data.recent.length;
  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <NewRecordButton entity="activities" variant="outline" size="xs">
          Add activity
        </NewRecordButton>
      </div>
      {empty ? (
        <EmptyState compact icon={CalendarClock} title="No activities yet" description="Log appointments, calls and visits to build a timeline." />
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
    </div>
  );
}
