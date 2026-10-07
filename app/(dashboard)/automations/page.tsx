import Link from "next/link";
import { Plus } from "@phosphor-icons/react/dist/ssr";
import { canManage, requireOrg } from "@/lib/supabase/server";
import { listAutomations, listRuns } from "@/lib/actions/automations";
import { PageContainer, PageHeader } from "@/components/layout/page";
import { Button } from "@/components/ui/button";
import { FlowsStudio } from "@/components/automations/flows-studio";

export const metadata = { title: "זרימות" };

export default async function AutomationsPage() {
  const { role } = await requireOrg();
  const manage = canManage(role);
  const [flows, runs] = await Promise.all([listAutomations(), listRuns()]);

  return (
    <PageContainer className="max-w-5xl">
      <PageHeader
        title="זרימות"
        description="זרימה עושה משהו לבד כשמשהו קורה. למשל: כשנרשמת מכירה ראשונה — מכינה הודעת תודה."
        actions={
          manage ? (
            <Button asChild variant="brand">
              <Link href="/automations/new">
                <Plus />
                זרימה חדשה
              </Link>
            </Button>
          ) : undefined
        }
      />
      <FlowsStudio flows={flows} runs={runs} canManage={manage} />
    </PageContainer>
  );
}
