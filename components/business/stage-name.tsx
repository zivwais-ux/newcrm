"use client";

import { useStageLabel } from "@/components/layout/workspace-provider";

/** A deal stage in the business's own words (for server components that render a stage key). */
export function StageName({ stage }: { stage: string | null | undefined }) {
  const label = useStageLabel();
  return <>{label(stage)}</>;
}
