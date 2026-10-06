import { UserPlus } from "@phosphor-icons/react/dist/ssr";
import { requireOrg } from "@/lib/supabase/server";
import { PageContainer, PageHeader } from "@/components/layout/page";
import { FilterTabs, Pagination, SearchInput } from "@/components/business/list-controls";
import { EmptyState } from "@/components/business/empty-state";
import { NewRecordButton } from "@/components/business/record-form";
import { LeadsTable } from "@/components/business/leads-table";
import { LiveDot, Module, ModuleFlush, ModuleRail } from "@/components/ui/module";
import { LEAD_STATUS_LABELS } from "@/components/business/labels";
import { pageParam, param, searchTerm, type SearchParams } from "@/lib/params";
import { formatNumber } from "@/lib/utils";
import type { Lead } from "@/types/domain";

export const metadata = { title: "פניות" };
const PAGE_SIZE = 50;

export default async function LeadsPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const { supabase, org } = await requireOrg();
  const page = pageParam(params);
  const q = searchTerm(param(params, "q"));
  const status = param(params, "status");

  let query = supabase.from("leads").select("*", { count: "exact" }).eq("organization_id", org.id);
  if (q) query = query.or(`name.ilike.%${q}%,email.ilike.%${q}%,source.ilike.%${q}%`);
  if (status) query = query.eq("status", status);
  const { data, count } = await query.order("created_at", { ascending: false }).range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  const { count: total } = await supabase.from("leads").select("id", { count: "exact", head: true }).eq("organization_id", org.id);

  return (
    <PageContainer>
      <PageHeader title="פניות" description="אנשים שהתעניינו ועוד לא הפכו ללקוחות — ומאיפה הם הגיעו." actions={<NewRecordButton entity="leads" />} />
      <Module>
        <ModuleRail
          icon={<UserPlus />}
          title="פניות"
          meta={total ? <span className="num">{formatNumber(count ?? 0)}</span> : undefined}
          actions={total ? <LiveDot state={q || status ? "filtered" : "live"} label={q || status ? "מסונן" : undefined} /> : undefined}
        />
        {!total ? (
          <EmptyState
            icon={UserPlus}
            title="אין עדיין פניות"
            description="כאן יופיעו אנשים שפנו אליך ועוד לא קנו. העלה קובץ אקסל או הוסף פנייה ראשונה."
            importCta
            action={<NewRecordButton entity="leads" variant="outline" />}
          />
        ) : (
          <>
            <div className="flex flex-col gap-2 border-b border-border px-3.5 py-2.5 sm:flex-row sm:items-center sm:justify-between">
              <SearchInput placeholder="חיפוש לפי שם, אימייל או מקור…" />
              <FilterTabs
                param="status"
                options={[
                  { value: "", label: "הכל" },
                  { value: "new", label: LEAD_STATUS_LABELS.new },
                  { value: "contacted", label: LEAD_STATUS_LABELS.contacted },
                  { value: "qualified", label: LEAD_STATUS_LABELS.qualified },
                  { value: "converted", label: LEAD_STATUS_LABELS.converted },
                  { value: "lost", label: LEAD_STATUS_LABELS.lost },
                ]}
              />
            </div>
            {data?.length ? (
              <ModuleFlush>
                <LeadsTable leads={data as Lead[]} />
              </ModuleFlush>
            ) : (
              <EmptyState compact icon={UserPlus} title="לא נמצאו פניות" description="נסה חיפוש אחר או סינון אחר." />
            )}
            <Pagination page={page} pageSize={PAGE_SIZE} total={count ?? 0} />
          </>
        )}
      </Module>
    </PageContainer>
  );
}
