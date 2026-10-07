-- Freedom for every business: its own words (terms) and its own deal stages.

-- 1. Vocabulary overrides, e.g. {"customer":"מטופל","appointment":"טיפול"}.
alter table public.organizations add column if not exists terms jsonb not null default '{}'::jsonb;

-- 2. Deal stages per organization. The "won" and "lost" stages keep their keys (they can be
--    renamed but not archived), so analytics keep working; any number of open stages can be added.
--    Stages are never removed from the table: an open stage is archived (its deals move first),
--    so history and imports that point at it stay valid.
create table if not exists public.deal_stages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  key text not null check (key ~ '^[a-z0-9_]{1,40}$'),
  label text not null check (char_length(label) between 1 and 60),
  position integer not null default 0,
  kind text not null default 'open' check (kind in ('open', 'won', 'lost')),
  archived boolean not null default false check (not (archived and kind <> 'open')),
  created_at timestamptz not null default now(),
  unique (organization_id, key)
);
create index if not exists deal_stages_org_idx on public.deal_stages (organization_id, position);

alter table public.deal_stages enable row level security;
create policy "members read stages" on public.deal_stages
  for select to authenticated using (public.is_org_member(organization_id));
create policy "admins insert stages" on public.deal_stages
  for insert to authenticated with check (public.has_org_role(organization_id, array['owner', 'admin']::public.member_role[]));
create policy "admins update stages" on public.deal_stages
  for update to authenticated
  using (public.has_org_role(organization_id, array['owner', 'admin']::public.member_role[]))
  with check (public.has_org_role(organization_id, array['owner', 'admin']::public.member_role[]));
grant select, insert, update on public.deal_stages to authenticated;

-- Default stages (the ones the app always had) for existing organizations. Settings, not business data.
insert into public.deal_stages (organization_id, key, label, position, kind)
select o.id, v.key, v.label, v.pos, v.kind
from public.organizations o
cross join (values
  ('new', 'חדשה', 0, 'open'), ('contacted', 'נוצר קשר', 1, 'open'), ('qualified', 'רלוונטית', 2, 'open'),
  ('proposal', 'נשלחה הצעה', 3, 'open'), ('negotiation', 'במשא ומתן', 4, 'open'),
  ('won', 'נסגרה בהצלחה', 5, 'won'), ('lost', 'לא נסגרה', 6, 'lost')
) as v(key, label, pos, kind)
on conflict (organization_id, key) do nothing;

-- …and for every new organization.
create or replace function public.organizations_seed_stages()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.deal_stages (organization_id, key, label, position, kind)
  values
    (new.id, 'new', 'חדשה', 0, 'open'), (new.id, 'contacted', 'נוצר קשר', 1, 'open'), (new.id, 'qualified', 'רלוונטית', 2, 'open'),
    (new.id, 'proposal', 'נשלחה הצעה', 3, 'open'), (new.id, 'negotiation', 'במשא ומתן', 4, 'open'),
    (new.id, 'won', 'נסגרה בהצלחה', 5, 'won'), (new.id, 'lost', 'לא נסגרה', 6, 'lost')
  on conflict (organization_id, key) do nothing;
  return new;
end;
$$;
create trigger organizations_seed_stages after insert on public.organizations
  for each row execute function public.organizations_seed_stages();

-- 3. Deals accept any (non-archived) stage that exists for their organization.
create or replace function public.deals_check_stage()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.deal_stages s
                 where s.organization_id = new.organization_id and s.key = new.stage and not s.archived) then
    raise exception 'unknown stage %', new.stage using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger deals_check_stage before insert or update of stage, organization_id on public.deals
  for each row execute function public.deals_check_stage();

-- 4. Pipeline totals follow the organization's own stages and order.
create or replace function public.pipeline_summary(org uuid)
returns table (stage text, deals bigint, value numeric)
language sql
stable
set search_path = ''
as $$
  select s.key, count(d.id), coalesce(sum(d.value), 0)
  from public.deal_stages s
  left join public.deals d on d.stage = s.key and d.organization_id = org
  where s.organization_id = org and not s.archived
  group by s.key, s.position
  order by s.position;
$$;

-- 5. Run separately (needs approval in the SQL editor): the old fixed list of stages is replaced
--    by the trigger above. Until it runs, only the 7 original stage keys can be used.
-- alter table public.deals drop constraint if exists deals_stage_check;
