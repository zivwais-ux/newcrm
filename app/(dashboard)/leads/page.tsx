import { UserPlus } from "lucide-react";
import { requireOrg } from "@/lib/supabase/server";
import { PageContainer, PageHeader } from "@/components/layout/page";
import { FilterTabs, Pagination, SearchInput } from "@/components/business/list-controls";
import { EmptyState } from "@/components/business/empty-state";
import { NewRecordButton } from "@/components/business/record-form";
import { LeadsTable } from "@/components/business/leads-table";
import { pageParam, param, searchTerm, type SearchParams } from "@/lib/params";
import type { Lead } from "@/types/domain";

export const metadata = { title: "Leads" };
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
      <PageHeader title="Leads" description="Potential customers and where they came from." actions={<NewRecordButton entity="leads" />} />
      {!total ? (
        <EmptyState icon={UserPlus} title="No leads yet" description="Add leads manually or import them from a spreadsheet." importCta action={<NewRecordButton entity="leads" variant="outline" />} />
      ) : (
        <>
          <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <SearchInput placeholder="Search leads…" />
            <FilterTabs
              param="status"
              options={[
                { value: "", label: "All" },
                { value: "new", label: "New" },
                { value: "contacted", label: "Contacted" },
                { value: "qualified", label: "Qualified" },
                { value: "converted", label: "Converted" },
                { value: "lost", label: "Lost" },
              ]}
            />
          </div>
          {data?.length ? <LeadsTable leads={data as Lead[]} /> : <EmptyState compact title="No matching leads" />}
          <Pagination page={page} pageSize={PAGE_SIZE} total={count ?? 0} />
        </>
      )}
    </PageContainer>
  );
}
