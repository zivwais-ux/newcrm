/**
 * Creates two demo workspaces with realistic data:
 *   demo-service@businessos.dev  → "Sparkle & Shine Cleaning" (service)
 *   demo-sales@businessos.dev    → "Northwind Digital" (sales)
 *
 * Usage: NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npm run seed:demo
 * Optional: DEMO_PASSWORD (default "demo-password-123").
 */
import { createAdminClient } from "../lib/supabase/admin";
import { generateSalesDataset, generateServiceDataset } from "../lib/demo/generator";
import { insertDemoDataset } from "../lib/demo/insert";
import type { BusinessType } from "../types/domain";

const password = process.env.DEMO_PASSWORD ?? "demo-password-123";

async function seed(email: string, fullName: string, orgName: string, type: BusinessType) {
  const admin = createAdminClient();
  const { data: list } = await admin.auth.admin.listUsers({ perPage: 1000 });
  let user = list?.users.find((u) => u.email === email);
  if (!user) {
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName },
    });
    if (error) throw error;
    user = data.user;
  }

  const { data: existing } = await admin.from("organization_members").select("organization_id").eq("user_id", user.id);
  if (existing?.length) {
    console.log(`• ${email} already has a workspace — skipping`);
    return;
  }

  const { data: org, error: orgError } = await admin
    .from("organizations")
    .insert({ name: orgName, business_type: type, onboarding_completed: true, data_source_pref: "excel" })
    .select("id")
    .single();
  if (orgError) throw orgError;
  await admin.from("organization_members").insert({ organization_id: org.id, user_id: user.id, role: "owner" });
  await admin.from("profiles").update({ current_organization_id: org.id, full_name: fullName }).eq("id", user.id);

  const ds = type === "sales" ? generateSalesDataset() : generateServiceDataset();
  await insertDemoDataset(admin, org.id, user.id, ds);
  console.log(`✓ ${orgName}: ${ds.customers.length} customers, ${ds.transactions.length} transactions, ${ds.deals.length} deals, ${ds.leads.length} leads`);
  console.log(`  sign in: ${email} / ${password}`);
}

async function main() {
  await seed("demo-service@businessos.dev", "Ziv", "Sparkle & Shine Cleaning", "service");
  await seed("demo-sales@businessos.dev", "Ziv", "Northwind Digital", "sales");
}

main().catch((error) => {
  console.error("Seeding failed:", error.message ?? error);
  process.exit(1);
});
