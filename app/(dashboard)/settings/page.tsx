import { getMembers, requireOrg, canManage } from "@/lib/supabase/server";
import { getDataCounts } from "@/lib/analytics/queries";
import { isAIConfigured } from "@/lib/ai/openai";
import { PageContainer, PageHeader } from "@/components/layout/page";
import { Badge } from "@/components/ui/badge";
import { ProfileForm, WorkspaceSettingsForm } from "@/components/business/settings-forms";
import { LoadDemoButton } from "@/components/data-import/load-demo-button";

export const metadata = { title: "Settings" };

function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <section className="grid gap-4 border-t py-8 first:border-t-0 first:pt-0 md:grid-cols-3">
      <div>
        <h2 className="text-sm font-semibold">{title}</h2>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      <div className="md:col-span-2">{children}</div>
    </section>
  );
}

export default async function SettingsPage() {
  const { supabase, org, role, profile, user } = await requireOrg();
  const [members, counts] = await Promise.all([getMembers(supabase, org.id), getDataCounts(supabase, org.id)]);
  const empty = Object.values(counts).every((n) => !n);

  return (
    <PageContainer className="max-w-4xl">
      <PageHeader title="Settings" />
      <Section title="Workspace" description="Your business and how the system adapts to it.">
        <WorkspaceSettingsForm
          initial={{ name: org.name, businessType: org.business_type, currency: org.currency }}
          canManage={canManage(role)}
        />
      </Section>
      <Section title="Profile" description={user.email ?? undefined}>
        <ProfileForm name={profile.full_name ?? ""} />
      </Section>
      <Section title="Team" description="Everyone with access to this workspace. Data is isolated per workspace.">
        <ul className="divide-y rounded-lg border bg-surface">
          {members.map((m) => (
            <li key={m.user_id} className="flex items-center justify-between px-4 py-3 text-sm">
              <span>
                {m.full_name ?? "Teammate"}
                {m.user_id === user.id && <span className="text-muted-foreground"> (you)</span>}
              </span>
              <Badge variant="outline" className="capitalize">
                {m.role}
              </Badge>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-muted-foreground">
          Owners and admins manage Components and settings. Members work with customers, deals, activities and tasks.
        </p>
      </Section>
      <Section title="AI" description="AI runs only on the server, using your workspace's data.">
        <p className="text-sm">
          Status:{" "}
          {isAIConfigured() ? (
            <Badge variant="positive">Connected</Badge>
          ) : (
            <Badge variant="warning">Not connected</Badge>
          )}
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          {isAIConfigured()
            ? "The analyst, column mapping and daily brief use OpenAI. The AI can read and recommend, but never changes data without your confirmation."
            : "Add OPENAI_API_KEY to the server environment to enable AI answers. Until then, the built-in analysis engine answers from your data."}
        </p>
      </Section>
      {empty && (
        <Section title="Sample data" description="Explore the product with a realistic dataset.">
          <LoadDemoButton />
        </Section>
      )}
    </PageContainer>
  );
}
