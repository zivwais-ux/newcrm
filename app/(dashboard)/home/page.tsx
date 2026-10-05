import { Suspense } from "react";
import { z } from "zod";
import { requireOrg, canManage } from "@/lib/supabase/server";
import { getDataCounts } from "@/lib/analytics/queries";
import { getBrief } from "@/lib/analytics/brief";
import { COMPONENT_REGISTRY, getDefinition, recommend, resolveConfig, topRecommendations } from "@/lib/components/registry";
import { activeFilterKeys, parseFilters } from "@/lib/components/filters";
import { getCustomerSpotlight } from "@/lib/components/spotlight";
import { Skeleton } from "@/components/ui/skeleton";
import { HomeBuilder } from "@/components/components-system/home-builder";
import { ComponentBody } from "@/components/components-system/component-body";
import { CustomerSpotlight } from "@/components/components-system/customer-spotlight";
import type { CanvasItem } from "@/components/components-system/canvas-frame";
import type { PaletteEntry } from "@/components/components-system/component-palette";
import { BriefCard } from "@/components/ai/brief-card";
import { param, type SearchParams } from "@/lib/params";
import type { InstalledComponent } from "@/types/domain";

export const metadata = { title: "בית" };

function BodySkeleton() {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-4">
        <Skeleton className="h-12" />
        <Skeleton className="h-12" />
        <Skeleton className="h-12" />
      </div>
      <Skeleton className="h-32" />
    </div>
  );
}

async function BriefSection({ org }: { org: { id: string; name: string; currency: string } }) {
  const { supabase } = await requireOrg();
  try {
    const brief = await getBrief(supabase, org);
    return brief.facts.hasData ? <BriefCard initial={brief} /> : null;
  } catch {
    return null;
  }
}

async function Spotlight({ id, orgId, currency }: { id: string; orgId: string; currency: string }) {
  const { supabase } = await requireOrg();
  const data = await getCustomerSpotlight(supabase, orgId, id).catch(() => null);
  return data ? <CustomerSpotlight data={data} currency={currency} /> : null;
}

export default async function HomePage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const { supabase, org, role, user } = await requireOrg();
  const filters = parseFilters(params);
  const customerParam = typeof params.customer === "string" && z.string().uuid().safeParse(params.customer).success ? params.customer : null;

  const [{ data: rows }, counts] = await Promise.all([
    supabase.from("components").select("*").eq("organization_id", org.id).order("position"),
    getDataCounts(supabase, org.id),
  ]);
  const installed = (rows ?? []) as InstalledComponent[];
  const ctx = { supabase, org: { id: org.id, currency: org.currency, business_type: org.business_type }, userId: user.id, filters };

  const items: CanvasItem[] = [];
  const bodies: Record<string, React.ReactNode> = {};
  for (const c of installed) {
    const def = getDefinition(c.component_type);
    if (!def) continue;
    const config = resolveConfig(def, c.config);
    items.push({
      id: c.id,
      type: def.id,
      name: def.name,
      description: def.description,
      w: config.w!,
      config: config as Record<string, string>,
      configFields: def.configFields,
      consumes: def.consumes,
    });
    bodies[c.id] = (
      <Suspense key={`${c.id}-${JSON.stringify(filters)}`} fallback={<BodySkeleton />}>
        <ComponentBody type={def.id} instanceId={c.id} savedConfig={c.config} counts={counts} ctx={ctx} />
      </Suspense>
    );
  }

  // The Component library: every registered Component, ranked for this business.
  const installedMap = new Map(installed.map((c) => [c.component_type, c.id]));
  const scored = new Map(recommend(org.business_type, counts, new Set()).map((r) => [r.definition.id, r]));
  const top = new Set(topRecommendations(org.business_type, counts, new Set(installedMap.keys())).map((r) => r.definition.id));
  const entries: PaletteEntry[] = COMPONENT_REGISTRY.map((d) => ({
    id: d.id,
    name: d.name,
    description: d.description,
    category: d.category,
    recommended: top.has(d.id),
    ready: scored.get(d.id)?.ready ?? true,
    reason: scored.get(d.id)?.reason ?? "",
    installedId: installedMap.get(d.id) ?? null,
    consumes: d.consumes,
    emits: d.emits,
  }));

  return (
    <>
      <HomeBuilder
        items={items}
        bodies={bodies}
        entries={entries}
        checklist={{ hasData: Object.values(counts).some((n) => n > 0), componentCount: installed.length }}
        canManage={canManage(role)}
        activeFilters={activeFilterKeys(filters)}
        updated={(param(params, "updated") ?? "").split(",").filter(Boolean)}
        top={
          <Suspense fallback={<Skeleton className="h-28 rounded-xl" />}>
            <BriefSection org={{ id: org.id, name: org.name, currency: org.currency }} />
          </Suspense>
        }
      />
      {customerParam && (
        <Suspense fallback={null}>
          <Spotlight id={customerParam} orgId={org.id} currency={org.currency} />
        </Suspense>
      )}
    </>
  );
}
