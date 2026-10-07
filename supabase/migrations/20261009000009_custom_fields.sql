-- Fields the business defines itself ("סוג שיעור", "מספר רכב", "יום הולדת"…).
-- Values live in each record's existing custom_fields jsonb under the field's key.

create table if not exists public.field_definitions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  entity text not null check (entity in ('customers', 'transactions', 'activities', 'deals', 'leads', 'tasks')),
  key text not null check (key ~ '^f_[a-z0-9_]{1,40}$'),
  label text not null check (char_length(label) between 1 and 60),
  type text not null check (type in ('text', 'number', 'money', 'date', 'select', 'multiselect', 'checkbox', 'phone')),
  options jsonb not null default '[]'::jsonb check (jsonb_typeof(options) = 'array'),
  position integer not null default 0,
  show_in_list boolean not null default false,
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  unique (organization_id, entity, key)
);
create index if not exists field_definitions_org_idx on public.field_definitions (organization_id, entity, position);

alter table public.field_definitions enable row level security;
create policy "members read fields" on public.field_definitions
  for select to authenticated using (public.is_org_member(organization_id));
create policy "admins insert fields" on public.field_definitions
  for insert to authenticated with check (public.has_org_role(organization_id, array['owner', 'admin']::public.member_role[]));
create policy "admins update fields" on public.field_definitions
  for update to authenticated
  using (public.has_org_role(organization_id, array['owner', 'admin']::public.member_role[]))
  with check (public.has_org_role(organization_id, array['owner', 'admin']::public.member_role[]));
grant select, insert, update on public.field_definitions to authenticated;

-- tasks had no custom_fields yet; every entity a field can belong to needs one.
alter table public.tasks add column if not exists custom_fields jsonb not null default '{}'::jsonb;
