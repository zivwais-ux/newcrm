-- Business OS — core schema, multi-tenancy and row level security.
-- Every business table carries organization_id and is protected by RLS.

create extension if not exists pg_trgm with schema extensions;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type public.business_type as enum ('service', 'sales', 'both');
create type public.member_role as enum ('owner', 'admin', 'member');

-- ---------------------------------------------------------------------------
-- Tenancy
-- ---------------------------------------------------------------------------
create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 120),
  business_type public.business_type not null default 'service',
  data_source_pref text,
  currency text not null default 'ILS',
  onboarding_completed boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  current_organization_id uuid references public.organizations (id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.organization_members (
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.member_role not null default 'member',
  created_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);
create index organization_members_user_idx on public.organization_members (user_id);

-- Membership helpers. SECURITY DEFINER so policies can consult membership
-- without recursively applying RLS on organization_members.
create or replace function public.is_org_member(org uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.organization_members m
    where m.organization_id = org and m.user_id = (select auth.uid())
  );
$$;

create or replace function public.has_org_role(org uuid, roles public.member_role[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.organization_members m
    where m.organization_id = org
      and m.user_id = (select auth.uid())
      and m.role = any (roles)
  );
$$;

-- Profile row for every new auth user.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Atomically create an organization, make the caller its owner and select it.
create or replace function public.create_organization(org_name text, org_type public.business_type)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_org uuid;
  uid uuid := (select auth.uid());
begin
  if uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  insert into public.organizations (name, business_type)
  values (org_name, org_type)
  returning id into new_org;

  insert into public.organization_members (organization_id, user_id, role)
  values (new_org, uid, 'owner');

  update public.profiles set current_organization_id = new_org where id = uid;

  return new_org;
end;
$$;

-- ---------------------------------------------------------------------------
-- Business data (canonical entities)
-- ---------------------------------------------------------------------------
create table public.data_sources (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null,
  type text not null check (type in ('csv', 'excel', 'manual', 'demo')),
  status text not null default 'active',
  created_at timestamptz not null default now()
);

create table public.imported_files (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  data_source_id uuid references public.data_sources (id) on delete set null,
  file_name text not null,
  file_type text not null,
  storage_path text,
  status text not null default 'uploaded'
    check (status in ('uploaded', 'analyzed', 'importing', 'completed', 'failed')),
  row_count integer,
  mapping jsonb,
  stats jsonb,
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null,
  email text,
  phone text,
  company text,
  status text not null default 'active' check (status in ('active', 'inactive', 'lead', 'churned')),
  owner_id uuid references auth.users (id) on delete set null,
  source_import_id uuid references public.imported_files (id) on delete set null,
  custom_fields jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.services (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null,
  category text,
  price numeric(12, 2),
  created_at timestamptz not null default now(),
  unique (organization_id, name)
);

create table public.leads (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  customer_id uuid references public.customers (id) on delete set null,
  name text not null,
  email text,
  phone text,
  source text,
  status text not null default 'new' check (status in ('new', 'contacted', 'qualified', 'converted', 'lost')),
  owner_id uuid references auth.users (id) on delete set null,
  value numeric(12, 2),
  source_import_id uuid references public.imported_files (id) on delete set null,
  custom_fields jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.deals (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  customer_id uuid references public.customers (id) on delete set null,
  name text not null,
  stage text not null default 'new'
    check (stage in ('new', 'contacted', 'qualified', 'proposal', 'negotiation', 'won', 'lost')),
  value numeric(12, 2) not null default 0,
  owner_id uuid references auth.users (id) on delete set null,
  expected_close date,
  last_activity_at timestamptz not null default now(),
  source_import_id uuid references public.imported_files (id) on delete set null,
  custom_fields jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  customer_id uuid references public.customers (id) on delete set null,
  service_id uuid references public.services (id) on delete set null,
  amount numeric(12, 2) not null,
  type text not null default 'sale' check (type in ('sale', 'refund', 'subscription', 'other')),
  date date not null,
  product_or_service text,
  status text not null default 'paid' check (status in ('paid', 'pending', 'cancelled', 'refunded')),
  owner_id uuid references auth.users (id) on delete set null,
  owner_name text,
  source_import_id uuid references public.imported_files (id) on delete set null,
  custom_fields jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.activities (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  customer_id uuid references public.customers (id) on delete set null,
  deal_id uuid references public.deals (id) on delete set null,
  type text not null default 'note'
    check (type in ('appointment', 'call', 'meeting', 'email', 'note', 'visit')),
  date timestamptz not null default now(),
  owner_id uuid references auth.users (id) on delete set null,
  notes text,
  source_import_id uuid references public.imported_files (id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  title text not null,
  description text,
  assigned_to uuid references auth.users (id) on delete set null,
  customer_id uuid references public.customers (id) on delete cascade,
  deal_id uuid references public.deals (id) on delete cascade,
  status text not null default 'open' check (status in ('open', 'done')),
  due_date date,
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);

create table public.components (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  component_type text not null,
  name text not null,
  config jsonb not null default '{}'::jsonb,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.ai_briefs (
  organization_id uuid not null references public.organizations (id) on delete cascade,
  brief_date date not null default current_date,
  content jsonb not null,
  created_at timestamptz not null default now(),
  primary key (organization_id, brief_date)
);

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------
create index customers_org_created_idx on public.customers (organization_id, created_at desc);
create index customers_org_email_idx on public.customers (organization_id, lower(email));
create index customers_org_phone_idx on public.customers (organization_id, phone);
create index customers_name_trgm_idx on public.customers using gin (name extensions.gin_trgm_ops);
create index customers_email_trgm_idx on public.customers using gin (email extensions.gin_trgm_ops);
create index customers_owner_idx on public.customers (owner_id);
create index customers_import_idx on public.customers (source_import_id);

create index transactions_org_date_idx on public.transactions (organization_id, date desc);
create index transactions_customer_idx on public.transactions (customer_id, date desc);
create index transactions_service_idx on public.transactions (service_id);
create index transactions_owner_idx on public.transactions (owner_id);
create index transactions_import_idx on public.transactions (source_import_id);

create index leads_org_status_idx on public.leads (organization_id, status);
create index leads_customer_idx on public.leads (customer_id);
create index leads_owner_idx on public.leads (owner_id);
create index leads_import_idx on public.leads (source_import_id);
create index leads_name_trgm_idx on public.leads using gin (name extensions.gin_trgm_ops);

create index deals_org_stage_idx on public.deals (organization_id, stage);
create index deals_customer_idx on public.deals (customer_id);
create index deals_owner_idx on public.deals (owner_id);
create index deals_import_idx on public.deals (source_import_id);
create index deals_name_trgm_idx on public.deals using gin (name extensions.gin_trgm_ops);

create index activities_org_date_idx on public.activities (organization_id, date desc);
create index activities_customer_idx on public.activities (customer_id, date desc);
create index activities_deal_idx on public.activities (deal_id);
create index activities_owner_idx on public.activities (owner_id);
create index activities_import_idx on public.activities (source_import_id);

create index tasks_org_status_idx on public.tasks (organization_id, status, due_date);
create index tasks_customer_idx on public.tasks (customer_id);
create index tasks_deal_idx on public.tasks (deal_id);
create index tasks_assigned_idx on public.tasks (assigned_to);
create index tasks_created_by_idx on public.tasks (created_by);

create index services_org_idx on public.services (organization_id);
create index components_org_idx on public.components (organization_id, position);
create index data_sources_org_idx on public.data_sources (organization_id);
create index imported_files_org_idx on public.imported_files (organization_id, created_at desc);
create index imported_files_source_idx on public.imported_files (data_source_id);
create index imported_files_created_by_idx on public.imported_files (created_by);
create index profiles_org_idx on public.profiles (current_organization_id);

-- updated_at maintenance
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger customers_touch before update on public.customers
  for each row execute function public.touch_updated_at();
create trigger leads_touch before update on public.leads
  for each row execute function public.touch_updated_at();
create trigger deals_touch before update on public.deals
  for each row execute function public.touch_updated_at();
create trigger components_touch before update on public.components
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------
alter table public.organizations enable row level security;
alter table public.profiles enable row level security;
alter table public.organization_members enable row level security;

create policy "members read their organizations" on public.organizations
  for select to authenticated using (public.is_org_member(id));
create policy "admins update their organization" on public.organizations
  for update to authenticated
  using (public.has_org_role(id, array['owner', 'admin']::public.member_role[]))
  with check (public.has_org_role(id, array['owner', 'admin']::public.member_role[]));
create policy "owners delete their organization" on public.organizations
  for delete to authenticated using (public.has_org_role(id, array['owner']::public.member_role[]));
-- organizations are created only through create_organization()

create policy "users read own profile" on public.profiles
  for select to authenticated using (id = (select auth.uid()));
create policy "users update own profile" on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (
    id = (select auth.uid())
    and (current_organization_id is null or public.is_org_member(current_organization_id))
  );

create policy "members read memberships" on public.organization_members
  for select to authenticated using (public.is_org_member(organization_id));
create policy "admins add members" on public.organization_members
  for insert to authenticated
  with check (public.has_org_role(organization_id, array['owner', 'admin']::public.member_role[]));
create policy "admins update members" on public.organization_members
  for update to authenticated
  using (public.has_org_role(organization_id, array['owner', 'admin']::public.member_role[]))
  with check (public.has_org_role(organization_id, array['owner', 'admin']::public.member_role[]));
create policy "admins remove members" on public.organization_members
  for delete to authenticated
  using (public.has_org_role(organization_id, array['owner', 'admin']::public.member_role[]));

-- Business tables: members read/create/update; owners and admins delete.
do $$
declare
  t text;
begin
  foreach t in array array[
    'data_sources', 'imported_files', 'customers', 'services', 'leads', 'deals',
    'transactions', 'activities', 'tasks', 'ai_briefs'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy "members read" on public.%I for select to authenticated using (public.is_org_member(organization_id))', t);
    execute format(
      'create policy "members insert" on public.%I for insert to authenticated with check (public.is_org_member(organization_id))', t);
    execute format(
      'create policy "members update" on public.%I for update to authenticated using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id))', t);
    execute format(
      'create policy "admins delete" on public.%I for delete to authenticated using (public.has_org_role(organization_id, array[''owner'', ''admin'']::public.member_role[]))', t);
  end loop;
end;
$$;

-- Members may delete the records they work with day to day.
create policy "members delete activities" on public.activities
  for delete to authenticated using (public.is_org_member(organization_id));
create policy "members delete tasks" on public.tasks
  for delete to authenticated using (public.is_org_member(organization_id));

-- Components (workspace layout): all members read; owners and admins manage.
alter table public.components enable row level security;
create policy "members read components" on public.components
  for select to authenticated using (public.is_org_member(organization_id));
create policy "admins insert components" on public.components
  for insert to authenticated
  with check (public.has_org_role(organization_id, array['owner', 'admin']::public.member_role[]));
create policy "admins update components" on public.components
  for update to authenticated
  using (public.has_org_role(organization_id, array['owner', 'admin']::public.member_role[]))
  with check (public.has_org_role(organization_id, array['owner', 'admin']::public.member_role[]));
create policy "admins delete components" on public.components
  for delete to authenticated
  using (public.has_org_role(organization_id, array['owner', 'admin']::public.member_role[]));

-- Function privileges
revoke execute on function public.create_organization(text, public.business_type) from public, anon;
grant execute on function public.create_organization(text, public.business_type) to authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Storage: private bucket for uploaded import files, scoped by org folder.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'imports', 'imports', false, 10485760,
  array[
    'text/csv', 'application/csv', 'text/plain', 'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ]
)
on conflict (id) do nothing;

create policy "members read org imports" on storage.objects
  for select to authenticated
  using (bucket_id = 'imports' and public.is_org_member(((storage.foldername(name))[1])::uuid));
create policy "members upload org imports" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'imports' and public.is_org_member(((storage.foldername(name))[1])::uuid));
create policy "admins delete org imports" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'imports'
    and public.has_org_role(((storage.foldername(name))[1])::uuid, array['owner', 'admin']::public.member_role[])
  );
