import { Handshake } from "lucide-react";
import { requireOrg } from "@/lib/supabase/server";
import { getPipelineSummary } from "@/lib/analytics/queries";
import { PageContainer, PageHeader } from "@/components/layout/page";
import { PipelineBoard } from "@/components/business/pipeline-board";
import { EmptyState } from "@/components/business/empty-state";
import { NewRecordButton } from "@/components/business/record-form";
import { Stat } from "@/components/business/stat";
import { formatCurrency } from "@/lib/utils";
import { param, type SearchParams } from "@/lib/params";
import type { Deal } from "@/types/domain";

export const metadata = { title: "Deals" };

export default async function DealsPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const { supabase, org } = await requireOrg();
  const [{ data }, summary] = await Promise.all([
    supabase.from("deals").select("*, customers(name)").eq("organization_id", org.id).order("value", { ascending: false }).limit(500),
    getPipelineSummary(supabase, org.id),
  ]);
  const deals = (data ?? []) as Deal[];
  const open = summary.filter((s) => s.stage !== "won" && s.stage !== "lost");
  const won = summary.find((s) => s.stage === "won");
  const lost = summary.find((s) => s.stage === "lost");
  const winRate = won && lost && won.deals + lost.deals ? Math.round((won.deals / (won.deals + lost.deals)) * 100) : null;

  return (
    <PageContainer className="max-w-none">
      <PageHeader title="Deals" description="Drag deals between stages. Click a deal to edit or reassign it." actions={<NewRecordButton entity="deals" />} />
      {!deals.length ? (
        <EmptyState icon={Handshake} title="No deals yet" description="Create your first deal or import your pipeline." importCta action={<NewRecordButton entity="deals" variant="outline" />} />
      ) : (
        <div className="space-y-6">
          <div className="grid max-w-3xl grid-cols-2 gap-5 sm:grid-cols-4">
            <Stat label="Open pipeline" value={formatCurrency(open.reduce((s, x) => s + x.value, 0), org.currency)} />
            <Stat label="Open deals" value={open.reduce((s, x) => s + x.deals, 0)} />
            <Stat label="Won" value={formatCurrency(won?.value ?? 0, org.currency)} hint={`${won?.deals ?? 0} deals`} />
            <Stat label="Win rate" value={winRate === null ? "—" : `${winRate}%`} />
          </div>
          <PipelineBoard deals={deals} focusDealId={param(params, "deal") ?? null} />
        </div>
      )}
    </PageContainer>
  );
}
