import { Handshake, Kanban } from "@phosphor-icons/react/dist/ssr";
import { requireOrg } from "@/lib/supabase/server";
import { getPipelineSummary } from "@/lib/analytics/queries";
import { loadStages } from "@/lib/stages";
import { PageContainer, PageHeader } from "@/components/layout/page";
import { PipelineBoard } from "@/components/business/pipeline-board";
import { EmptyState } from "@/components/business/empty-state";
import { NewRecordButton } from "@/components/business/record-form";
import { Stat } from "@/components/business/stat";
import { formatCurrency, formatNumber, plural } from "@/lib/utils";
import { Ltr } from "@/components/ui/ltr";
import { Module, ModuleBody, ModuleRail } from "@/components/ui/module";
import { param, type SearchParams } from "@/lib/params";
import type { Deal } from "@/types/domain";

export const metadata = { title: "עסקאות" };

export default async function DealsPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const { supabase, org } = await requireOrg();
  const [{ data }, summary, stages] = await Promise.all([
    supabase.from("deals").select("*, customers(name, phone)").eq("organization_id", org.id).order("value", { ascending: false }).limit(500),
    getPipelineSummary(supabase, org.id),
    loadStages(supabase, org.id),
  ]);
  const deals = (data ?? []) as Deal[];
  const kindOf = (key: string) => stages.find((s) => s.key === key)?.kind ?? "open";
  const open = summary.filter((s) => kindOf(s.stage) === "open");
  const won = summary.find((s) => kindOf(s.stage) === "won");
  const lost = summary.find((s) => kindOf(s.stage) === "lost");
  const winRate = won && lost && won.deals + lost.deals ? Math.round((won.deals / (won.deals + lost.deals)) * 100) : null;

  return (
    <PageContainer className="max-w-none">
      <PageHeader title="עסקאות" description="גרור עסקה משלב לשלב. לחץ על עסקה כדי לערוך אותה." actions={<NewRecordButton entity="deals" />} />
      {!deals.length ? (
        <Module>
          <ModuleRail icon={<Kanban />} title="עסקאות בתהליך" />
          <EmptyState
            icon={Handshake}
            title="אין עדיין עסקאות"
            description="כאן תראה את כל העסקאות שבתהליך, לפי שלבים. הוסף עסקה ראשונה או העלה קובץ אקסל."
            importCta
            action={<NewRecordButton entity="deals" variant="outline" />}
          />
        </Module>
      ) : (
        <div className="space-y-6">
          <Module className="max-w-4xl">
            <div className="grid grid-cols-2 gap-px bg-border sm:grid-cols-4 [&>*]:bg-module [&>*]:p-4">
              <Stat label="שווי עסקאות פתוחות" value={<Ltr>{formatCurrency(open.reduce((s, x) => s + x.value, 0), org.currency)}</Ltr>} />
              <Stat label="עסקאות פתוחות" value={formatNumber(open.reduce((s, x) => s + x.deals, 0))} />
              <Stat label="נסגרו בהצלחה" value={<Ltr>{formatCurrency(won?.value ?? 0, org.currency)}</Ltr>} hint={plural(won?.deals ?? 0, "עסקה", "עסקאות", "עסקה אחת")} />
              <Stat label="אחוז הצלחה" value={winRate === null ? "—" : <Ltr>{winRate}%</Ltr>} />
            </div>
          </Module>
          <Module>
            <ModuleRail icon={<Kanban />} title="עסקאות בתהליך" meta={<span className="num">{formatNumber(deals.length)}</span>} />
            <ModuleBody className="p-3 sm:p-4">
              <PipelineBoard deals={deals} summary={summary} focusDealId={param(params, "deal") ?? null} />
            </ModuleBody>
          </Module>
        </div>
      )}
    </PageContainer>
  );
}
