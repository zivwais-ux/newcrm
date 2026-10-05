import { redirect } from "next/navigation";
import { getMembers, requireOrg } from "@/lib/supabase/server";
import { WorkspaceProvider } from "@/components/layout/workspace-provider";
import { SidebarNav } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { loadTemplates } from "@/lib/whatsapp-server";

// Server actions on these pages (import chunks) can take longer than the default.
export const maxDuration = 60;

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { supabase, user, profile, org, role } = await requireOrg();
  if (!org.onboarding_completed) redirect("/onboarding");
  const [members, templates] = await Promise.all([getMembers(supabase, org.id), loadTemplates(supabase, org.id)]);
  const name = profile.full_name || user.email?.split("@")[0] || "חבר צוות";

  return (
    <WorkspaceProvider
      value={{
        org: { id: org.id, name: org.name, business_type: org.business_type, currency: org.currency },
        user: { id: user.id, name, email: user.email ?? "" },
        role,
        members,
        templates,
      }}
    >
      <div className="flex min-h-screen">
        <aside className="sticky top-0 hidden h-screen w-64 shrink-0 border-e bg-sidebar lg:block">
          <SidebarNav />
        </aside>
        <div className="flex min-w-0 flex-1 flex-col">
          <Topbar />
          <main className="flex-1 pb-24 lg:pb-0">{children}</main>
        </div>
      </div>
    </WorkspaceProvider>
  );
}
