import { requireOrg } from "@/lib/supabase/server";
import { getDataCounts } from "@/lib/analytics/queries";
import { AnalystChat } from "@/components/ai/analyst-chat";
import { param, type SearchParams } from "@/lib/params";

export const metadata = { title: "היועץ החכם" };

export default async function AIPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const { supabase, org } = await requireOrg();
  const counts = await getDataCounts(supabase, org.id).catch(() => null);
  const q = param(params, "q")?.slice(0, 1000) ?? null;
  return <AnalystChat key={q ?? "empty"} initialQuestion={q} hasData={!!counts && Object.values(counts).some((n) => n > 0)} />;
}
