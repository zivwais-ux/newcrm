/**
 * Emits SQL files that create a demo login + "Sparkle & Shine Cleaning" workspace
 * with realistic data — for seeding a hosted Supabase project through its SQL editor
 * (no service-role key needed). Usage: tsx scripts/demo-sql.ts <outDir> [email] [password]
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { generateServiceDataset } from "../lib/demo/generator";
import { COMPONENT_REGISTRY, resolveConfig } from "../lib/components/registry";

const [outDir = "demo-sql", email = "demo@businessos.dev", password = "BusinessOS-demo-2026"] = process.argv.slice(2);
mkdirSync(outDir, { recursive: true });

const q = (v: unknown): string => {
  if (v === null || v === undefined) return "null";
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : "null";
  if (typeof v === "boolean") return v ? "true" : "false";
  if (typeof v === "object") return `'${JSON.stringify(v).replace(/'/g, "''")}'::jsonb`;
  return `'${String(v).replace(/'/g, "''")}'`;
};

const userId = randomUUID();
const orgId = randomUUID();
const ds = generateServiceDataset(new Date());

const header = `
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change, email_change_token_current, reauthentication_token)
values (${q(userId)}, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', ${q(email)},
  extensions.crypt(${q(password)}, extensions.gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}', '{"full_name":"Ziv"}', now(), now(), '', '', '', '', '', '');
insert into auth.identities (id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at)
values (gen_random_uuid(), ${q(userId)}, ${q(userId)}, 'email',
  jsonb_build_object('sub', ${q(userId)}::text, 'email', ${q(email)}, 'email_verified', true), now(), now(), now());
insert into public.organizations (id, name, business_type, data_source_pref, onboarding_completed)
values (${q(orgId)}, 'Sparkle & Shine Cleaning', 'service', 'excel', true);
insert into public.organization_members (organization_id, user_id, role) values (${q(orgId)}, ${q(userId)}, 'owner');
update public.profiles set current_organization_id = ${q(orgId)}, full_name = 'Ziv' where id = ${q(userId)};
insert into public.data_sources (organization_id, name, type) values (${q(orgId)}, 'Sparkle & Shine Cleaning (sample data)', 'demo');
`;

const recommended = ["revenue-intelligence", "customer-hub", "customer-risk", "repeat-customers", "ai-analyst"];
const components = recommended
  .map((id, i) => {
    const def = COMPONENT_REGISTRY.find((c) => c.id === id)!;
    return `(${q(orgId)}, ${q(id)}, ${q(def.name)}, ${q(resolveConfig(def, null))}, ${i})`;
  })
  .join(",\n");

const files: string[] = [header];
files.push(
  `insert into public.services (id, organization_id, name, category, price) values\n` +
    ds.services.map((s) => `(${q(s.id)}, ${q(orgId)}, ${q(s.name)}, ${q(s.category)}, ${s.price})`).join(",\n") +
    ";\n" +
    `insert into public.components (organization_id, component_type, name, config, position) values\n${components};\n`,
);

function chunked<T>(rows: T[], size: number, render: (chunk: T[]) => string) {
  for (let i = 0; i < rows.length; i += size) files.push(render(rows.slice(i, i + size)));
}
chunked(ds.customers, 600, (c) =>
  `insert into public.customers (id, organization_id, name, email, phone, company, status, owner_id, custom_fields, created_at, updated_at) values\n` +
  c.map((x) => `(${q(x.id)}, ${q(orgId)}, ${q(x.name)}, ${q(x.email)}, ${q(x.phone)}, ${q(x.company)}, ${q(x.status)}, ${q(userId)}, ${q(x.custom_fields)}, ${q(x.created_at)}, ${q(x.created_at)})`).join(",\n") + ";\n",
);
chunked(ds.transactions, 1000, (t) =>
  `insert into public.transactions (organization_id, customer_id, service_id, product_or_service, amount, date, owner_name, status, type) values\n` +
  t.map((x) => `(${q(orgId)}, ${q(x.customer_id)}, ${q(x.service_id)}, ${q(x.product_or_service)}, ${x.amount}, ${q(x.date)}, ${q(x.owner_name)}, ${q(x.status)}, ${q(x.type)})`).join(",\n") + ";\n",
);
files.push(
  `insert into public.activities (organization_id, customer_id, type, date, notes, owner_id) values\n` +
    ds.activities.map((a) => `(${q(orgId)}, ${q(a.customer_id)}, ${q(a.type)}, ${q(a.date)}, ${q(a.notes)}, ${q(userId)})`).join(",\n") +
    ";\n" +
    `insert into public.tasks (organization_id, title, description, customer_id, status, due_date, assigned_to, created_by) values\n` +
    ds.tasks.map((t) => `(${q(orgId)}, ${q(t.title)}, ${q(t.description)}, ${q(t.customer_id)}, ${q(t.status)}, ${q(t.due_date)}, ${q(userId)}, ${q(userId)})`).join(",\n") +
    ";\n",
);

files.forEach((sql, i) => writeFileSync(`${outDir}/${String(i).padStart(2, "0")}.sql`, sql));
console.log(JSON.stringify({ outDir, files: files.length, email, orgId, customers: ds.customers.length, transactions: ds.transactions.length }));
