import { AlertCircle } from "lucide-react";
import { EmptyState } from "@/components/business/empty-state";
import { getDefinition, missingEntities, resolveConfig, ENTITY_SINGULAR } from "@/lib/components/registry";
import { COMPONENT_LOADERS, type LoaderContext } from "@/lib/components/loaders";
import type { DataCounts } from "@/types/domain";
import { ComponentView } from "./views";

/**
 * Server Component: verifies the Component's required data, loads it from the
 * canonical data layer and renders the client view (or a helpful empty state).
 */
export async function ComponentBody({
  type,
  instanceId,
  savedConfig,
  counts,
  ctx,
  overrides,
}: {
  type: string;
  instanceId: string | null;
  savedConfig: Record<string, unknown> | null;
  counts: DataCounts;
  ctx: LoaderContext;
  overrides?: Record<string, string>;
}) {
  const def = getDefinition(type);
  if (!def) return <EmptyState compact icon={AlertCircle} title="This Component is no longer available" />;
  const config = resolveConfig(def, { ...(savedConfig ?? {}), ...(overrides ?? {}) });

  const missing = missingEntities(def, counts);
  if (missing.length) {
    return (
      <EmptyState
        compact
        title={def.emptyState.title}
        description={`This Component needs ${missing.map((m) => ENTITY_SINGULAR[m]).join(" and ")} data. ${def.emptyState.description}`}
        importCta
      />
    );
  }

  let data: unknown;
  try {
    data = await COMPONENT_LOADERS[def.id](ctx, config);
  } catch {
    return (
      <EmptyState
        compact
        icon={AlertCircle}
        title="We couldn't load this Component"
        description="Your data is safe. Please refresh the page in a moment."
      />
    );
  }
  return <ComponentView type={def.id} data={data} config={config} instanceId={instanceId} currency={ctx.org.currency} />;
}
