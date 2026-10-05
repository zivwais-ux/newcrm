-- Phase 2.1: WhatsApp as a first-class activity, and editable message templates.

alter table public.activities drop constraint if exists activities_type_check;
alter table public.activities
  add constraint activities_type_check
  check (type in ('appointment', 'call', 'meeting', 'email', 'note', 'visit', 'whatsapp'));

create table public.message_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  body text not null check (char_length(body) between 1 and 1000),
  position integer not null default 0,
  created_at timestamptz not null default now()
);

create index message_templates_org_idx on public.message_templates (organization_id, position);

alter table public.message_templates enable row level security;

create policy "members read templates" on public.message_templates
  for select to authenticated using (public.is_org_member(organization_id));
create policy "admins insert templates" on public.message_templates
  for insert to authenticated with check (public.has_org_role(organization_id, array['owner', 'admin']::public.member_role[]));
create policy "admins update templates" on public.message_templates
  for update to authenticated
  using (public.has_org_role(organization_id, array['owner', 'admin']::public.member_role[]))
  with check (public.has_org_role(organization_id, array['owner', 'admin']::public.member_role[]));
create policy "admins delete templates" on public.message_templates
  for delete to authenticated using (public.has_org_role(organization_id, array['owner', 'admin']::public.member_role[]));
