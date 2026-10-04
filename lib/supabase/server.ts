import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "./config";
import type { MemberRole, Organization } from "@/types/domain";

/** User-scoped client. Every query runs under the user's JWT, so RLS applies. */
export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Called from a Server Component — middleware refreshes the session instead.
        }
      },
    },
  });
}

export interface OrgContext {
  supabase: SupabaseClient;
  user: User;
  profile: { id: string; full_name: string | null; current_organization_id: string | null };
  org: Organization;
  role: MemberRole;
}

/** Resolves the signed-in user and their active organization (cached per request). */
export const getSession = cache(async () => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { supabase, user: null, profile: null, org: null, role: null } as const;

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, full_name, current_organization_id")
    .eq("id", user.id)
    .maybeSingle();

  const { data: memberships } = await supabase
    .from("organization_members")
    .select("role, organization_id, organizations(*)")
    .eq("user_id", user.id);

  type MembershipRow = { role: MemberRole; organization_id: string; organizations: Organization | null };
  const rows = (memberships ?? []) as unknown as MembershipRow[];
  const active =
    rows.find((m) => m.organization_id === profile?.current_organization_id) ?? rows[0] ?? null;

  return {
    supabase,
    user,
    profile: profile ?? { id: user.id, full_name: null, current_organization_id: null },
    org: active?.organizations ?? null,
    role: active?.role ?? null,
  } as const;
});

/** For pages and actions that require an organization. Redirects otherwise. */
export async function requireOrg(): Promise<OrgContext> {
  const s = await getSession();
  if (!s.user) redirect("/login");
  if (!s.org || !s.role) redirect("/onboarding");
  return s as OrgContext;
}

export function canManage(role: MemberRole) {
  return role === "owner" || role === "admin";
}
