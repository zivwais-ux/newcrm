import { redirect } from "next/navigation";
import { getMembers, requireOrg } from "@/lib/supabase/server";
import { WorkspaceProvider } from "@/components/layout/workspace-provider";
import { CreateProvider } from "@/components/layout/create-provider";
import { Dock } from "@/components/layout/dock";
import { TopStrip } from "@/components/layout/top-strip";
import { loadTemplates } from "@/lib/whatsapp-server";
import { loadFields, loadStages } from "@/lib/stages";
import { resolveTerms } from "@/lib/terms";
import type { NotificationRow } from "@/lib/actions/automations";

// Server actions on these pages (import chunks) can take longer than the default.
export const maxDuration = 60;

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { supabase, user, profile, org, role } = await requireOrg();
  if (!org.onboarding_completed) redirect("/onboarding");
  const terms = resolveTerms(org.terms);
  const [members, templates, stages, fields, outbox, notifications] = await Promise.all([
    getMembers(supabase, org.id),
    loadTemplates(supabase, org.id, terms),
    loadStages(supabase, org.id),
    loadFields(supabase, org.id),
    // Errors here only hide the badge / bell content; they never break the page.
    supabase.from("outbox_messages").select("id", { count: "exact", head: true }).eq("organization_id", org.id).eq("status", "pending"),
    supabase
      .from("notifications")
      .select("id, title, body, link, read_at, created_at")
      .eq("organization_id", org.id)
      .order("created_at", { ascending: false })
      .limit(30),
  ]);
  const name = profile.full_name || user.email?.split("@")[0] || "חבר צוות";

  return (
    <WorkspaceProvider
      value={{
        org: { id: org.id, name: org.name, business_type: org.business_type, currency: org.currency },
        user: { id: user.id, name, email: user.email ?? "" },
        role,
        members,
        templates,
        terms,
        stages,
        fields,
        pendingOutbox: outbox.error ? 0 : (outbox.count ?? 0),
        notifications: notifications.error ? [] : ((notifications.data ?? []) as NotificationRow[]),
      }}
    >
      <CreateProvider>
        <div className="flex min-h-[100dvh] flex-col">
          <TopStrip />
          {/* Bottom room so content never hides under the floating dock. */}
          <main className="flex-1 pb-28">{children}</main>
          <Dock />
        </div>
      </CreateProvider>
    </WorkspaceProvider>
  );
}
