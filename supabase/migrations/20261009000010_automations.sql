-- Automations: WHEN → IF → WAIT → DO, executed inside Postgres.
-- Records added or changed by people enqueue work (table triggers); pg_cron processes the queue every
-- few minutes and scans date-based triggers each morning. Messages are never sent automatically:
-- WhatsApp text is prepared into outbox_messages and waits for one tap in the app.
-- No DELETE anywhere: finished work is marked by status.

-- ---------------------------------------------------------------------------
-- Tables

create table if not exists public.automations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  enabled boolean not null default false,
  trigger jsonb not null,
  conditions jsonb not null default '[]'::jsonb check (jsonb_typeof(conditions) = 'array'),
  wait jsonb not null default '{"days":0,"hours":0}'::jsonb,
  actions jsonb not null check (jsonb_typeof(actions) = 'array'),
  recipe_key text,
  archived boolean not null default false,
  runs_count integer not null default 0,
  last_run_at timestamptz,
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists automations_org_idx on public.automations (organization_id) where enabled and not archived;

create table if not exists public.automation_queue (
  id uuid primary key default gen_random_uuid(),
  automation_id uuid not null references public.automations (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  record_type text not null,
  record_id uuid not null,
  context jsonb not null default '{}'::jsonb,
  run_at timestamptz not null default now(),
  status text not null default 'pending' check (status in ('pending', 'done', 'skipped', 'failed')),
  dedupe_key text not null,
  created_at timestamptz not null default now(),
  unique (automation_id, dedupe_key)
);
create index if not exists automation_queue_due_idx on public.automation_queue (run_at) where status = 'pending';

create table if not exists public.automation_runs (
  id uuid primary key default gen_random_uuid(),
  automation_id uuid not null references public.automations (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  record_type text not null,
  record_id uuid not null,
  status text not null check (status in ('done', 'skipped', 'failed')),
  summary text,
  created_at timestamptz not null default now()
);
create index if not exists automation_runs_idx on public.automation_runs (automation_id, created_at desc);

create table if not exists public.outbox_messages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  customer_id uuid references public.customers (id) on delete cascade,
  lead_id uuid references public.leads (id) on delete cascade,
  name text,
  phone text not null,
  body text not null,
  automation_id uuid references public.automations (id) on delete set null,
  status text not null default 'pending' check (status in ('pending', 'sent', 'dismissed')),
  created_at timestamptz not null default now(),
  handled_at timestamptz
);
create index if not exists outbox_pending_idx on public.outbox_messages (organization_id, created_at desc) where status = 'pending';

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid references auth.users (id) on delete cascade,
  title text not null,
  body text,
  link text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists notifications_org_idx on public.notifications (organization_id, created_at desc);

-- RLS: members see their organization's rows; owners/admins edit automations;
-- any member can handle a prepared message or mark a notification read.
alter table public.automations enable row level security;
alter table public.automation_queue enable row level security;
alter table public.automation_runs enable row level security;
alter table public.outbox_messages enable row level security;
alter table public.notifications enable row level security;

create policy "members read automations" on public.automations for select to authenticated using (public.is_org_member(organization_id));
create policy "admins insert automations" on public.automations for insert to authenticated
  with check (public.has_org_role(organization_id, array['owner', 'admin']::public.member_role[]));
create policy "admins update automations" on public.automations for update to authenticated
  using (public.has_org_role(organization_id, array['owner', 'admin']::public.member_role[]))
  with check (public.has_org_role(organization_id, array['owner', 'admin']::public.member_role[]));
create policy "members read queue" on public.automation_queue for select to authenticated using (public.is_org_member(organization_id));
create policy "members read runs" on public.automation_runs for select to authenticated using (public.is_org_member(organization_id));
create policy "members read outbox" on public.outbox_messages for select to authenticated using (public.is_org_member(organization_id));
create policy "members handle outbox" on public.outbox_messages for update to authenticated
  using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));
create policy "members read notifications" on public.notifications for select to authenticated
  using (public.is_org_member(organization_id) and (user_id is null or user_id = auth.uid()));
create policy "members mark notifications" on public.notifications for update to authenticated
  using (public.is_org_member(organization_id) and (user_id is null or user_id = auth.uid()))
  with check (public.is_org_member(organization_id));

grant select, insert, update on public.automations to authenticated;
grant select on public.automation_queue, public.automation_runs to authenticated;
grant select, update on public.outbox_messages, public.notifications to authenticated;

-- ---------------------------------------------------------------------------
-- Helpers (internal: refuse direct calls through the API)

create or replace function public.automation_internal_only()
returns void
language plpgsql
stable
set search_path = ''
as $$
begin
  if session_user = 'authenticator' then
    raise exception 'internal function' using errcode = '42501';
  end if;
end;
$$;

-- The customer behind any record.
create or replace function public.automation_customer_id(p_org uuid, p_entity text, p_id uuid)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  c uuid;
begin
  perform public.automation_internal_only();
  case p_entity
    when 'customers' then select id into c from public.customers where id = p_id and organization_id = p_org;
    when 'transactions' then select customer_id into c from public.transactions where id = p_id and organization_id = p_org;
    when 'activities' then select customer_id into c from public.activities where id = p_id and organization_id = p_org;
    when 'deals' then select customer_id into c from public.deals where id = p_id and organization_id = p_org;
    when 'leads' then select customer_id into c from public.leads where id = p_id and organization_id = p_org;
    when 'tasks' then select customer_id into c from public.tasks where id = p_id and organization_id = p_org;
    else c := null;
  end case;
  return c;
end;
$$;

-- One whitelisted value of a record, as text (conditions compare these).
create or replace function public.automation_value(p_org uuid, p_entity text, p_id uuid, p_field text)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  cust uuid;
  v text;
  k text;
begin
  perform public.automation_internal_only();
  cust := public.automation_customer_id(p_org, p_entity, p_id);

  if p_field like 'cf:%' then
    k := substr(p_field, 4);
    execute format('select case jsonb_typeof(custom_fields->%L) when ''array'' then (select string_agg(x, '','') from jsonb_array_elements_text(custom_fields->%L) x) else custom_fields->>%L end from public.%I where id = $1 and organization_id = $2',
                   k, k, k, p_entity)
      into v using p_id, p_org;
    return v;
  end if;

  case p_field
    when 'status' then
      if p_entity in ('customers', 'leads', 'transactions', 'tasks') then
        execute format('select status from public.%I where id = $1 and organization_id = $2', p_entity) into v using p_id, p_org;
      end if;
    when 'has_phone' then
      if p_entity = 'leads' then
        select (coalesce(nullif(trim(l.phone), ''), nullif(trim(c.phone), '')) is not null)::text into v
        from public.leads l left join public.customers c on c.id = l.customer_id where l.id = p_id;
      else
        select (nullif(trim(phone), '') is not null)::text into v from public.customers where id = cust;
        v := coalesce(v, 'false');
      end if;
    when 'purchases' then
      select count(distinct t.date)::text into v from public.transactions t
      where t.organization_id = p_org and t.customer_id = cust and public.is_paid_sale(t);
    when 'total_revenue' then
      select coalesce(sum(public.revenue_value(t)), 0)::text into v from public.transactions t
      where t.organization_id = p_org and t.customer_id = cust;
    when 'days_since_purchase' then
      select (public.il_today() - max(t.date))::text into v from public.transactions t
      where t.organization_id = p_org and t.customer_id = cust and public.is_paid_sale(t);
    when 'amount' then
      select amount::text into v from public.transactions where id = p_id and organization_id = p_org;
    when 'service' then
      select public.service_label(product_or_service) into v from public.transactions where id = p_id and organization_id = p_org;
    when 'is_first_purchase' then
      select (not exists (
        select 1 from public.transactions o
        where o.organization_id = p_org and o.customer_id = t.customer_id and o.id <> t.id
          and public.is_paid_sale(o) and o.date <= t.date
      ))::text into v
      from public.transactions t where t.id = p_id and t.organization_id = p_org and t.customer_id is not null;
      v := coalesce(v, 'false');
    when 'type' then
      select type into v from public.activities where id = p_id and organization_id = p_org;
    when 'source' then
      select source into v from public.leads where id = p_id and organization_id = p_org;
    when 'stage' then
      select stage into v from public.deals where id = p_id and organization_id = p_org;
    when 'value' then
      select value::text into v from public.deals where id = p_id and organization_id = p_org;
    else
      v := null;
  end case;
  return v;
end;
$$;

-- All conditions of an automation hold for this record right now.
create or replace function public.automation_matches(p_org uuid, p_conditions jsonb, p_entity text, p_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  c jsonb;
  actual text;
  expected text;
  op text;
  ok boolean;
begin
  perform public.automation_internal_only();
  for c in select * from jsonb_array_elements(coalesce(p_conditions, '[]'::jsonb)) loop
    actual := public.automation_value(p_org, p_entity, p_id, c->>'field');
    expected := coalesce(c->>'value', '');
    op := c->>'op';
    ok := case op
      when 'eq' then lower(trim(coalesce(actual, ''))) = lower(trim(expected))
      when 'neq' then lower(trim(coalesce(actual, ''))) <> lower(trim(expected))
      when 'contains' then position(lower(expected) in lower(coalesce(actual, ''))) > 0
      when 'empty' then nullif(trim(coalesce(actual, '')), '') is null
      when 'not_empty' then nullif(trim(coalesce(actual, '')), '') is not null
      when 'gt' then actual ~ '^-?[0-9]+(\.[0-9]+)?$' and expected ~ '^-?[0-9]+(\.[0-9]+)?$' and actual::numeric > expected::numeric
      when 'lt' then actual ~ '^-?[0-9]+(\.[0-9]+)?$' and expected ~ '^-?[0-9]+(\.[0-9]+)?$' and actual::numeric < expected::numeric
      else false
    end;
    if not coalesce(ok, false) then
      return false;
    end if;
  end loop;
  return true;
end;
$$;

-- {שם} {שירות} {סכום} {תאריך} {שעה} {עסק} → values from the record.
create or replace function public.automation_fill(p_text text, p_org uuid, p_entity text, p_id uuid, p_context jsonb)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  cust uuid;
  v_name text;
  v_service text;
  v_amount text;
  v_when timestamptz;
  v_org text;
  out text := coalesce(p_text, '');
begin
  perform public.automation_internal_only();
  cust := public.automation_customer_id(p_org, p_entity, p_id);
  select name into v_org from public.organizations where id = p_org;

  case p_entity
    when 'deals' then select name into v_name from public.deals where id = p_id;
    when 'leads' then select name into v_name from public.leads where id = p_id;
    when 'tasks' then select title into v_name from public.tasks where id = p_id;
    else select name into v_name from public.customers where id = cust;
  end case;

  if p_entity = 'transactions' then
    select nullif(trim(product_or_service), ''), '₪' || to_char(amount, 'FM999,999,990') into v_service, v_amount
    from public.transactions where id = p_id;
  else
    select nullif(trim(t.product_or_service), ''), '₪' || to_char(t.amount, 'FM999,999,990') into v_service, v_amount
    from public.transactions t where t.customer_id = cust and t.organization_id = p_org and public.is_paid_sale(t)
    order by t.date desc, t.created_at desc limit 1;
  end if;

  if p_context ? 'activity_id' then
    select date into v_when from public.activities where id = (p_context->>'activity_id')::uuid and organization_id = p_org;
  elsif p_entity = 'activities' then
    select date into v_when from public.activities where id = p_id;
  end if;

  out := replace(out, '{שם}', coalesce(split_part(v_name, ' ', 1), ''));
  out := replace(out, '{שירות}', coalesce(v_service, ''));
  out := replace(out, '{סכום}', coalesce(v_amount, ''));
  out := replace(out, '{תאריך}', coalesce(to_char(v_when at time zone 'Asia/Jerusalem', 'DD/MM'), ''));
  out := replace(out, '{שעה}', coalesce(to_char(v_when at time zone 'Asia/Jerusalem', 'HH24:MI'), ''));
  out := replace(out, '{עסק}', coalesce(v_org, ''));
  return regexp_replace(out, '\s+', ' ', 'g');
end;
$$;

-- ---------------------------------------------------------------------------
-- Enqueue: record events from people (not from imports, not from automations themselves)

create or replace function public.automation_enqueue(p_org uuid, p_entity text, p_id uuid, p_event text, p_dedupe text, p_context jsonb default '{}'::jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  a record;
  n integer := 0;
  wait_interval interval;
begin
  -- Only for a member's own organization when reached through the API.
  if session_user = 'authenticator' and not public.is_org_member(p_org) then
    return 0;
  end if;
  for a in
    select * from public.automations
    where organization_id = p_org and enabled and not archived
      and (
        (p_event = 'created' and trigger->>'type' = 'record_created' and trigger->>'entity' = p_entity)
        or (p_event like 'stage:%' and p_entity = 'deals' and trigger->>'type' = 'deal_stage' and 'stage:' || (trigger->>'stage') = p_event)
        or (p_event like 'status:%' and trigger->>'type' = 'status_changed' and trigger->>'entity' = p_entity and 'status:' || (trigger->>'status') = p_event)
        or (p_event = 'scan' )
      )
  loop
    wait_interval := make_interval(days => coalesce((a.wait->>'days')::int, 0), hours => coalesce((a.wait->>'hours')::int, 0));
    insert into public.automation_queue (automation_id, organization_id, record_type, record_id, context, run_at, dedupe_key)
    values (a.id, p_org, p_entity, p_id, coalesce(p_context, '{}'::jsonb), now() + wait_interval, p_dedupe)
    on conflict (automation_id, dedupe_key) do nothing;
    n := n + 1;
  end loop;
  return n;
end;
$$;

create or replace function public.automation_on_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  entity text := tg_table_name;
begin
  -- Rows created by automations or by file imports never start automations (no loops, no history spam).
  if current_setting('app.automation', true) = 'on' then
    return new;
  end if;
  if tg_op = 'INSERT' and new.source_import_id is not null then
    return new;
  end if;
  if not exists (select 1 from public.automations where organization_id = new.organization_id and enabled and not archived) then
    return new;
  end if;

  if tg_op = 'INSERT' then
    perform public.automation_enqueue(new.organization_id, entity, new.id, 'created', 'created:' || new.id);
    if entity in ('transactions', 'leads') then
      perform public.automation_enqueue(new.organization_id, entity, new.id, 'status:' || new.status, 'status:' || new.id || ':' || new.status);
    end if;
    if entity = 'deals' then
      perform public.automation_enqueue(new.organization_id, entity, new.id, 'stage:' || new.stage, 'stage:' || new.id || ':' || new.stage);
    end if;
  elsif entity = 'deals' and new.stage is distinct from old.stage then
    perform public.automation_enqueue(new.organization_id, entity, new.id, 'stage:' || new.stage, 'stage:' || new.id || ':' || new.stage);
  elsif entity in ('transactions', 'leads') and new.status is distinct from old.status then
    perform public.automation_enqueue(new.organization_id, entity, new.id, 'status:' || new.status, 'status:' || new.id || ':' || new.status);
  end if;
  return new;
end;
$$;

-- tasks has no source_import_id; give it a guard-compatible trigger of its own.
create or replace function public.automation_on_task()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if current_setting('app.automation', true) = 'on' then
    return new;
  end if;
  if exists (select 1 from public.automations where organization_id = new.organization_id and enabled and not archived) then
    perform public.automation_enqueue(new.organization_id, 'tasks', new.id, 'created', 'created:' || new.id);
  end if;
  return new;
end;
$$;

create trigger automation_on_customers after insert on public.customers for each row execute function public.automation_on_change();
create trigger automation_on_transactions after insert or update of status on public.transactions for each row execute function public.automation_on_change();
create trigger automation_on_activities after insert on public.activities for each row execute function public.automation_on_change();
create trigger automation_on_leads after insert or update of status on public.leads for each row execute function public.automation_on_change();
create trigger automation_on_deals after insert or update of stage on public.deals for each row execute function public.automation_on_change();
create trigger automation_on_tasks after insert on public.tasks for each row execute function public.automation_on_task();

-- ---------------------------------------------------------------------------
-- Daily scan: date-based and inactivity triggers (runs each morning, Israel time)

create or replace function public.automation_scan()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  a record;
  r record;
  today date := public.il_today();
  target date;
  n integer := 0;
  k text;
begin
  perform public.automation_internal_only();
  for a in
    select * from public.automations
    where enabled and not archived and trigger->>'type' in ('days_from_date', 'no_activity')
  loop
    if a.trigger->>'type' = 'days_from_date' then
      -- "before" looks forward (appointment tomorrow); otherwise backward (bought 45 days ago).
      target := case when coalesce((a.trigger->>'before')::boolean, false)
                     then today + (a.trigger->>'days')::int
                     else today - (a.trigger->>'days')::int end;

      if a.trigger->>'anchor' = 'last_purchase' then
        for r in
          select t.customer_id as id, max(t.date) as d
          from public.transactions t
          where t.organization_id = a.organization_id and t.customer_id is not null and public.is_paid_sale(t)
          group by t.customer_id
          having max(t.date) = target
        loop
          n := n + public.automation_enqueue(a.organization_id, 'customers', r.id, 'scan', 'lp:' || r.id || ':' || r.d);
        end loop;

      elsif a.trigger->>'anchor' = 'appointment' then
        for r in
          select ac.id as activity_id, ac.customer_id as id
          from public.activities ac
          where ac.organization_id = a.organization_id and ac.customer_id is not null
            and ac.type in ('appointment', 'meeting', 'visit')
            and (ac.date at time zone 'Asia/Jerusalem')::date = target
        loop
          n := n + public.automation_enqueue(a.organization_id, 'customers', r.id, 'scan', 'appt:' || r.activity_id, jsonb_build_object('activity_id', r.activity_id));
        end loop;

      elsif a.trigger->>'anchor' = 'custom_date' and (a.trigger->>'field') ~ '^f_[a-z0-9_]{1,40}$' then
        k := a.trigger->>'field';
        for r in
          select c.id, (c.custom_fields->>k)::date as d
          from public.customers c
          where c.organization_id = a.organization_id
            and (c.custom_fields->>k) ~ '^\d{4}-\d{2}-\d{2}$'
            and (
              (c.custom_fields->>k)::date = target
              -- Dates in past years repeat yearly (birthdays, anniversaries).
              or (extract(year from (c.custom_fields->>k)::date) < extract(year from target)
                  and to_char((c.custom_fields->>k)::date, 'MM-DD') = to_char(target, 'MM-DD'))
            )
        loop
          n := n + public.automation_enqueue(a.organization_id, 'customers', r.id, 'scan', 'cd:' || r.id || ':' || target);
        end loop;
      end if;

    else
      target := today - (a.trigger->>'days')::int;
      if a.trigger->>'entity' = 'deals' then
        for r in
          select d.id from public.deals d
          join public.deal_stages s on s.organization_id = d.organization_id and s.key = d.stage and s.kind = 'open'
          where d.organization_id = a.organization_id
            and (d.last_activity_at at time zone 'Asia/Jerusalem')::date = target
        loop
          n := n + public.automation_enqueue(a.organization_id, 'deals', r.id, 'scan', 'na:' || r.id || ':' || target);
        end loop;
      else
        for r in
          select c.id from public.customers c
          where c.organization_id = a.organization_id
            and greatest(
              (select max(t.date) from public.transactions t where t.customer_id = c.id and public.is_paid_sale(t)),
              (select max((x.date at time zone 'Asia/Jerusalem')::date) from public.activities x
                where x.customer_id = c.id and x.type <> 'whatsapp' and x.date <= now())
            ) = target
        loop
          n := n + public.automation_enqueue(a.organization_id, 'customers', r.id, 'scan', 'na:' || r.id || ':' || target);
        end loop;
      end if;
    end if;
  end loop;
  return n;
end;
$$;

-- ---------------------------------------------------------------------------
-- Process the queue: re-check conditions, then act.

create or replace function public.automation_process(p_limit integer default 200)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  q record;
  a record;
  act jsonb;
  cust uuid;
  phone text;
  cname text;
  done_parts text[];
  n integer := 0;
  v_deal uuid;
  v_lead uuid;
begin
  perform public.automation_internal_only();
  -- Rows written below must not start automations again.
  perform set_config('app.automation', 'on', true);

  for q in
    select * from public.automation_queue
    where status = 'pending' and run_at <= now()
    order by run_at
    limit p_limit
    for update skip locked
  loop
    select * into a from public.automations where id = q.automation_id;
    if a is null or not a.enabled or a.archived then
      update public.automation_queue set status = 'skipped' where id = q.id;
      continue;
    end if;

    begin
      if not public.automation_matches(q.organization_id, a.conditions, q.record_type, q.record_id) then
        update public.automation_queue set status = 'skipped' where id = q.id;
        insert into public.automation_runs (automation_id, organization_id, record_type, record_id, status, summary)
        values (a.id, q.organization_id, q.record_type, q.record_id, 'skipped', 'התנאים כבר לא מתקיימים');
        continue;
      end if;

      cust := public.automation_customer_id(q.organization_id, q.record_type, q.record_id);
      v_deal := case when q.record_type = 'deals' then q.record_id else null end;
      v_lead := case when q.record_type = 'leads' then q.record_id else null end;
      done_parts := array[]::text[];

      for act in select * from jsonb_array_elements(a.actions) loop
        case act->>'type'
          when 'create_task' then
            insert into public.tasks (organization_id, title, customer_id, deal_id, due_date, assigned_to, created_by)
            values (q.organization_id,
                    left(public.automation_fill(act->>'title', q.organization_id, q.record_type, q.record_id, q.context), 200),
                    cust, v_deal,
                    public.il_today() + coalesce((act->>'due_in_days')::int, 0),
                    a.created_by, a.created_by);
            done_parts := done_parts || 'משימה';

          when 'prepare_whatsapp' then
            if v_lead is not null then
              select coalesce(nullif(trim(l.phone), ''), nullif(trim(c.phone), '')), l.name into phone, cname
              from public.leads l left join public.customers c on c.id = l.customer_id where l.id = v_lead;
            else
              select nullif(trim(phone), ''), name into phone, cname from public.customers where id = cust;
            end if;
            if phone is not null then
              insert into public.outbox_messages (organization_id, customer_id, lead_id, name, phone, body, automation_id)
              values (q.organization_id, cust, v_lead, cname, phone,
                      left(public.automation_fill(act->>'body', q.organization_id, q.record_type, q.record_id, q.context), 1000), a.id);
              done_parts := done_parts || 'הודעה מוכנה';
            else
              done_parts := done_parts || 'אין טלפון — דילגנו על ההודעה';
            end if;

          when 'add_note' then
            if cust is not null or v_deal is not null then
              insert into public.activities (organization_id, customer_id, deal_id, type, date, notes)
              values (q.organization_id, cust, v_deal, 'note', now(),
                      left(public.automation_fill(act->>'text', q.organization_id, q.record_type, q.record_id, q.context), 1000));
              done_parts := done_parts || 'הערה';
            end if;

          when 'notify' then
            insert into public.notifications (organization_id, title, link)
            values (q.organization_id,
                    left(public.automation_fill(act->>'title', q.organization_id, q.record_type, q.record_id, q.context), 200),
                    case when cust is not null then '/customers/' || cust when v_deal is not null then '/deals?deal=' || v_deal else null end);
            done_parts := done_parts || 'התראה';

          when 'set_value' then
            if act->>'target' = 'customer_status' and cust is not null and (act->>'value') in ('active', 'inactive', 'lead', 'churned') then
              update public.customers set status = act->>'value' where id = cust and organization_id = q.organization_id;
              done_parts := done_parts || 'סטטוס עודכן';
            elsif act->>'target' = 'lead_status' and v_lead is not null and (act->>'value') in ('new', 'contacted', 'qualified', 'converted', 'lost') then
              update public.leads set status = act->>'value' where id = v_lead and organization_id = q.organization_id;
              done_parts := done_parts || 'סטטוס עודכן';
            elsif act->>'target' = 'deal_stage' and v_deal is not null then
              update public.deals set stage = act->>'value' where id = v_deal and organization_id = q.organization_id;
              done_parts := done_parts || 'שלב עודכן';
            elsif act->>'target' = 'custom_field'
                  and exists (select 1 from public.field_definitions f
                              where f.organization_id = q.organization_id and f.entity = q.record_type
                                and f.key = act->>'field' and not f.archived) then
              execute format('update public.%I set custom_fields = custom_fields || jsonb_build_object($1, $2::text) where id = $3 and organization_id = $4', q.record_type)
                using act->>'field', act->>'value', q.record_id, q.organization_id;
              done_parts := done_parts || 'שדה עודכן';
            end if;
          else
            null;
        end case;
      end loop;

      update public.automation_queue set status = 'done' where id = q.id;
      update public.automations set runs_count = runs_count + 1, last_run_at = now() where id = a.id;
      insert into public.automation_runs (automation_id, organization_id, record_type, record_id, status, summary)
      values (a.id, q.organization_id, q.record_type, q.record_id, 'done', array_to_string(done_parts, ' · '));
      n := n + 1;
    exception when others then
      update public.automation_queue set status = 'failed' where id = q.id;
      insert into public.automation_runs (automation_id, organization_id, record_type, record_id, status, summary)
      values (a.id, q.organization_id, q.record_type, q.record_id, 'failed', left(sqlerrm, 300));
    end;
  end loop;
  return n;
end;
$$;

-- ---------------------------------------------------------------------------
-- Schedule (pg_cron). Applied separately in the dashboard if the extension needs enabling there:
--   create extension if not exists pg_cron;
--   select cron.schedule('automation-process', '*/5 * * * *', 'select public.automation_process()');
--   select cron.schedule('automation-scan', '5 4 * * *', 'select public.automation_scan()');
