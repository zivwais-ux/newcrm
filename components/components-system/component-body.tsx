import { AlertCircle, Database } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { entitiesText, getDefinition, missingEntities, resolveConfig } from "@/lib/components/registry";
import { COMPONENT_LOADERS, type LoaderContext } from "@/lib/components/loaders";
import type { DataCounts } from "@/types/domain";
import { ImportButton } from "@/components/data-import/import-button";
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
  if (!def) return <EmptyState compact icon={<AlertCircle />} title="הכלי הזה כבר לא זמין" />;
  const config = resolveConfig(def, { ...(savedConfig ?? {}), ...(overrides ?? {}) });

  const missing = missingEntities(def, counts);
  if (missing.length) {
    return (
      <EmptyState
        compact
        icon={<Database />}
        title={def.emptyState.title}
        description={`הכלי הזה צריך ${entitiesText(missing)}. ${def.emptyState.description}`}
        action={<ImportButton need={missing[0]} hint={`הכלי "${def.name}" צריך ${entitiesText(missing)}. העלה קובץ שיש בו אותם — כל פורמט, כל שמות עמודות.`} />}
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
        icon={<AlertCircle />}
        title="משהו השתבש בטעינת הכלי"
        description="הנתונים שלך שמורים. רענן את העמוד בעוד רגע."
      />
    );
  }
  return <ComponentView type={def.id} data={data} config={config} instanceId={instanceId} currency={ctx.org.currency} />;
}
