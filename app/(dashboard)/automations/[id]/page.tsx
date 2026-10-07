import { notFound, redirect } from "next/navigation";
import { canManage, requireOrg } from "@/lib/supabase/server";
import { getAutomation, listRuns } from "@/lib/actions/automations";
import { PageContainer } from "@/components/layout/page";
import { FlowEditor } from "@/components/automations/flow-editor";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return { title: id === "new" ? "זרימה חדשה" : "עריכת זרימה" };
}

export default async function AutomationEditorPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ recipe?: string | string[] }>;
}) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const { role } = await requireOrg();
  const manage = canManage(role);

  if (id === "new") {
    // Only managers create flows; everyone else goes back to the list.
    if (!manage) redirect("/automations");
    const recipe = typeof sp.recipe === "string" ? sp.recipe : undefined;
    return (
      <PageContainer>
        <FlowEditor key={`new-${recipe ?? ""}`} initial={null} recipeKey={recipe} canManage runs={[]} />
      </PageContainer>
    );
  }

  const flow = await getAutomation(id);
  if (!flow) notFound();
  const runs = await listRuns(flow.id);

  return (
    <PageContainer>
      <FlowEditor key={flow.id} initial={flow} canManage={manage} runs={runs} />
    </PageContainer>
  );
}
