import { notFound } from "next/navigation";
import Link from "next/link";
import { CaretLeft } from "@phosphor-icons/react/dist/ssr";
import { z } from "zod";
import { requireOrg } from "@/lib/supabase/server";
import { getDataCounts } from "@/lib/analytics/queries";
import { getDefinition } from "@/lib/components/registry";
import { PageContainer, PageHeader } from "@/components/layout/page";
import { ComponentBody } from "@/components/components-system/component-body";
import { LiveDot, Module, ModuleBody, ModuleRail } from "@/components/ui/module";
import type { InstalledComponent } from "@/types/domain";

export const metadata = { title: "כלי" };

export default async function ComponentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) notFound();
  const { supabase, org } = await requireOrg();
  const { data } = await supabase.from("components").select("*").eq("id", id).eq("organization_id", org.id).maybeSingle();
  if (!data) notFound();
  const instance = data as InstalledComponent;
  const def = getDefinition(instance.component_type);
  if (!def) notFound();
  const counts = await getDataCounts(supabase, org.id);

  return (
    <PageContainer>
      <Link href="/home" className="mb-4 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
        <CaretLeft className="size-3.5 rtl:-scale-x-100" />
        חזרה למסך הבית
      </Link>
      <PageHeader title={def.name} description={def.description} />
      <Module>
        <ModuleRail title="תצוגה מלאה" actions={<LiveDot />} />
        <ModuleBody className="sm:p-6">
          <ComponentBody
            type={def.id}
            instanceId={instance.id}
            savedConfig={instance.config}
            counts={counts}
            ctx={{ supabase, org: { id: org.id, currency: org.currency, business_type: org.business_type } }}
          />
        </ModuleBody>
      </Module>
    </PageContainer>
  );
}
