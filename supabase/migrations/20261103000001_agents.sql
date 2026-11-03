-- The agent team: each run, and what the agents found. Agents never change business records;
-- their suggested actions run only when a person approves them in the app.

create table if not exists public.agent_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  kind text not null check (kind in ('team', 'ask')),
  status text not null default 'running' check (status in ('running', 'done', 'failed')),
  prompt_tokens integer not null default 0,
  completion_tokens integer not null default 0,
  cost_usd numeric(10, 5) not null default 0,
  duration_ms integer,
  error text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  finished_at timestamptz
);
create index if not exists agent_runs_org_created on public.agent_runs (organization_id, kind, created_at desc);

create table if not exists public.agent_insights (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.agent_runs(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  agent text not null check (agent in ('revenue', 'customers', 'sales', 'chief')),
  position integer not null default 0,
  headline text not null check (char_length(headline) <= 200),
  detail text check (char_length(detail) <= 1000),
  severity text not null check (severity in ('info', 'opportunity', 'warning', 'critical')),
  evidence jsonb not null default '[]'::jsonb,
  actions jsonb not null default '[]'::jsonb,
  summary text check (char_length(summary) <= 400),
  status text not null default 'new' check (status in ('new', 'done', 'dismissed')),
  created_at timestamptz not null default now()
);
create index if not exists agent_insights_org_agent on public.agent_insights (organization_id, agent, created_at desc);

alter table public.agent_runs enable row level security;
alter table public.agent_insights enable row level security;

create policy "members read agent runs" on public.agent_runs for select to authenticated
  using (public.is_org_member(organization_id));
create policy "members open agent runs" on public.agent_runs for insert to authenticated
  with check (public.is_org_member(organization_id));
create policy "members close agent runs" on public.agent_runs for update to authenticated
  using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));

create policy "members read agent insights" on public.agent_insights for select to authenticated
  using (public.is_org_member(organization_id));
create policy "members save agent insights" on public.agent_insights for insert to authenticated
  with check (public.is_org_member(organization_id));
create policy "members handle agent insights" on public.agent_insights for update to authenticated
  using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));

grant select, insert, update on public.agent_runs, public.agent_insights to authenticated;
