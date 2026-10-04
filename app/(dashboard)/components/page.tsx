import { requireOrg, canManage } from "@/lib/supabase/server";
import { getDataCounts } from "@/lib/analytics/queries";
import { COMPONENT_REGISTRY, recommend, topRecommendations } from "@/lib/components/registry";
import { PageContainer, PageHeader } from "@/components/layout/page";
import { ComponentStore, type StoreEntry } from "@/components/components-system/component-store";

export const metadata = { title: "Components" };

export default async function ComponentsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const params = await searchParams;
  const { supabase, org, role } = await requireOrg();
  const [{ data: installed }, counts] = await Promise.all([
    supabase.from("components").select("id, component_type").eq("organization_id", org.id),
    getDataCounts(supabase, org.id),
  ]);
  const installedMap = new Map((installed ?? []).map((c) => [c.component_type, c.id]));
  const installedSet = new Set(installedMap.keys());
  const scored = new Map(recommend(org.business_type, counts, new Set()).map((r) => [r.definition.id, r]));
  const top = new Set(topRecommendations(org.business_type, counts, installedSet).map((r) => r.definition.id));

  const entries: StoreEntry[] = COMPONENT_REGISTRY.map((definition) => {
    const r = scored.get(definition.id)!;
    return {
      definition,
      installedId: installedMap.get(definition.id) ?? null,
      recommended: top.has(definition.id),
      reason: r.reason,
      ready: r.ready,
    };
  });

  return (
    <PageContainer>
      <PageHeader
        title="Components"
        description="Modular business tools that run on your own data. Add only what your business needs."
      />
      <ComponentStore
        entries={entries}
        canManage={canManage(role)}
        justImported={params.imported === "1"}
        focus={params.focus ?? null}
        counts={counts}
      />
    </PageContainer>
  );
}
