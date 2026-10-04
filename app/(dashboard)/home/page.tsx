import { Suspense } from "react";
import Link from "next/link";
import { ArrowRight, Plus, Upload } from "lucide-react";
import { requireOrg, canManage } from "@/lib/supabase/server";
import { getDataCounts } from "@/lib/analytics/queries";
import { getBrief } from "@/lib/analytics/brief";
import { getDefinition, resolveConfig, topRecommendations } from "@/lib/components/registry";
import { PageContainer } from "@/components/layout/page";
import { Greeting } from "@/components/layout/greeting";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { WorkspaceGrid, type GridItem } from "@/components/components-system/workspace-grid";
import { ComponentBody } from "@/components/components-system/component-body";
import { BriefCard } from "@/components/ai/brief-card";
import type { InstalledComponent } from "@/types/domain";

export const metadata = { title: "Home" };

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
    return <BriefCard initial={brief} />;
  } catch {
    return null;
  }
}

export default async function HomePage() {
  const { supabase, org, profile, user, role } = await requireOrg();
  const [{ data: rows }, counts] = await Promise.all([
    supabase.from("components").select("*").eq("organization_id", org.id).order("position"),
    getDataCounts(supabase, org.id),
  ]);
  const installed = (rows ?? []) as InstalledComponent[];
  const firstName = (profile.full_name || user.email?.split("@")[0] || "there").split(" ")[0];
  const hasData = Object.values(counts).some((n) => n > 0);
  const ctx = { supabase, org: { id: org.id, currency: org.currency, business_type: org.business_type } };

  if (!installed.length) {
    const recs = topRecommendations(org.business_type, counts, new Set());
    return (
      <PageContainer className="flex min-h-[calc(100vh-3.5rem)] flex-col">
        <div className="flex flex-1 flex-col items-center justify-center pb-24 text-center">
          <Greeting name={firstName} />
          <p className="mt-6 text-lg text-zinc-700">Your workspace is ready.</p>
          <p className="mt-1 text-[15px] text-muted-foreground">Build the tools your business needs.</p>
          <div className="mt-8 flex flex-wrap justify-center gap-2">
            <Button asChild size="lg">
              <Link href="/components">
                <Plus />
                Add Component
              </Link>
            </Button>
            {!hasData && (
              <Button asChild size="lg" variant="outline">
                <Link href="/data/import">
                  <Upload />
                  Import data
                </Link>
              </Button>
            )}
          </div>
          {hasData && recs.length > 0 && (
            <Link
              href="/components"
              className="mt-8 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              We found {counts.customers.toLocaleString("en-US")} customers
              {counts.transactions ? ` and ${counts.transactions.toLocaleString("en-US")} transactions` : ""} — {recs.length} Components are
              recommended for you
              <ArrowRight className="size-3.5" />
            </Link>
          )}
        </div>
      </PageContainer>
    );
  }

  const items: GridItem[] = [];
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
      size: config.size ?? def.defaultSize,
      config: config as Record<string, string>,
      configFields: def.configFields,
    });
    bodies[c.id] = (
      <Suspense fallback={<BodySkeleton />}>
        <ComponentBody type={def.id} instanceId={c.id} savedConfig={c.config} counts={counts} ctx={ctx} />
      </Suspense>
    );
  }

  return (
    <PageContainer>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <Greeting name={firstName} />
          <p className="mt-1 text-sm text-muted-foreground">Here&apos;s what&apos;s happening at {org.name}.</p>
        </div>
        {canManage(role) && (
          <Button asChild variant="outline" size="sm">
            <Link href="/components">
              <Plus />
              Add Component
            </Link>
          </Button>
        )}
      </div>
      <div className="space-y-4">
        <Suspense fallback={<Skeleton className="h-36 rounded-lg" />}>
          <BriefSection org={{ id: org.id, name: org.name, currency: org.currency }} />
        </Suspense>
        <WorkspaceGrid items={items} bodies={bodies} canManage={canManage(role)} />
      </div>
    </PageContainer>
  );
}
