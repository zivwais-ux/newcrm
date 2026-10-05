"use client";

import type { ComponentType } from "react";
import type { ViewProps } from "./shared";
import { CustomerHubView } from "./views/customer-hub";
import { RevenueView } from "./views/revenue";
import { AIAnalystView } from "./views/ai-analyst";
import { RepeatCustomersView } from "./views/repeat-customers";
import { CustomerRiskView } from "./views/customer-risk";
import { ActivitiesView } from "./views/activities";
import { SalesPipelineView } from "./views/sales-pipeline";
import { DealRiskView } from "./views/deal-risk";
import { FollowupRadarView } from "./views/followup-radar";
import { TasksView } from "./views/tasks";

/** View registry — keyed by Component id (see lib/components/registry.ts). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const COMPONENT_VIEWS: Record<string, ComponentType<ViewProps<any>>> = {
  "customer-hub": CustomerHubView,
  "revenue-intelligence": RevenueView,
  "ai-analyst": AIAnalystView,
  "repeat-customers": RepeatCustomersView,
  "customer-risk": CustomerRiskView,
  activities: ActivitiesView,
  "sales-pipeline": SalesPipelineView,
  "deal-risk": DealRiskView,
  "followup-radar": FollowupRadarView,
  tasks: TasksView,
};

export function ComponentView({ type, ...props }: ViewProps<unknown> & { type: string }) {
  const View = COMPONENT_VIEWS[type];
  if (!View) return <p className="text-sm text-muted-foreground">הכלי הזה כבר לא זמין.</p>;
  return <View {...props} />;
}
