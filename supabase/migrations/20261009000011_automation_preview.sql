-- "Try it now": which records a flow would run on, without doing anything.
-- The daily scan and the preview share one candidate finder, so what people see is what runs.

-- Internal helpers also serve the preview (it checks membership first and sets this flag for its own transaction;
-- API clients cannot set custom settings themselves).
create or replace function public.automation_internal_only()
returns void
language plpgsql
stable
set search_path = ''
as $$
begin
  if session_user = 'authenticator' and coalesce(current_setting('app.automation_preview', true), '') <> 'on' then
    raise exception 'internal function' using errcode = '42501';
  end if;
end;
$$;

-- Records a date/inactivity trigger picks on a given day.
create or replace function public.automation_candidates(p_org uuid, p_trigger jsonb, p_today date)
returns table (record_type text, record_id uuid, dedupe text, context jsonb)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  target date;
  k text;
begin
  perform public.automation_internal_only();
  if p_trigger->>'type' = 'days_from_date' then
    -- "before" looks forward (appointment tomorrow); otherwise backward (bought 45 days ago).
    target := case when coalesce((p_trigger->>'before')::boolean, false)
                   then p_today + (p_trigger->>'days')::int
                   else p_today - (p_trigger->>'days')::int end;

    if p_trigger->>'anchor' = 'last_purchase' then
      return query
        select 'customers'::text, t.customer_id, 'lp:' || t.customer_id || ':' || max(t.date), '{}'::jsonb
        from public.transactions t
        where t.organization_id = p_org and t.customer_id is not null and public.is_paid_sale(t)
        group by t.customer_id
        having max(t.date) = target;

    elsif p_trigger->>'anchor' = 'appointment' then
      return query
        select 'customers'::text, ac.customer_id, 'appt:' || ac.id, jsonb_build_object('activity_id', ac.id)
        from public.activities ac
        where ac.organization_id = p_org and ac.customer_id is not null
          and ac.type in ('appointment', 'meeting', 'visit')
          and (ac.date at time zone 'Asia/Jerusalem')::date = target;

    elsif p_trigger->>'anchor' = 'custom_date' and (p_trigger->>'field') ~ '^f_[a-z0-9_]{1,40}$' then
      k := p_trigger->>'field';
      return query
        select 'customers'::text, c.id, 'cd:' || c.id || ':' || target, '{}'::jsonb
        from public.customers c
        where c.organization_id = p_org
          and (c.custom_fields->>k) ~ '^\d{4}-\d{2}-\d{2}$'
          and (
            (c.custom_fields->>k)::date = target
            -- Dates in past years repeat yearly (birthdays, anniversaries).
            or (extract(year from (c.custom_fields->>k)::date) < extract(year from target)
                and to_char((c.custom_fields->>k)::date, 'MM-DD') = to_char(target, 'MM-DD'))
          );
    end if;

  elsif p_trigger->>'type' = 'no_activity' then
    target := p_today - (p_trigger->>'days')::int;
    if p_trigger->>'entity' = 'deals' then
      return query
        select 'deals'::text, d.id, 'na:' || d.id || ':' || target, '{}'::jsonb
        from public.deals d
        join public.deal_stages s on s.organization_id = d.organization_id and s.key = d.stage and s.kind = 'open'
        where d.organization_id = p_org
          and (d.last_activity_at at time zone 'Asia/Jerusalem')::date = target;
    else
      return query
        select 'customers'::text, c.id, 'na:' || c.id || ':' || target, '{}'::jsonb
        from public.customers c
        where c.organization_id = p_org
          and greatest(
            (select max(t.date) from public.transactions t where t.customer_id = c.id and public.is_paid_sale(t)),
            (select max((x.date at time zone 'Asia/Jerusalem')::date) from public.activities x
              where x.customer_id = c.id and x.type <> 'whatsapp' and x.date <= now())
          ) = target;
    end if;
  end if;
end;
$$;

create or replace function public.automation_scan()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  a record;
  r record;
  n integer := 0;
begin
  perform public.automation_internal_only();
  for a in
    select * from public.automations
    where enabled and not archived and trigger->>'type' in ('days_from_date', 'no_activity')
  loop
    for r in select * from public.automation_candidates(a.organization_id, a.trigger, public.il_today()) loop
      n := n + public.automation_enqueue(a.organization_id, r.record_type, r.record_id, 'scan', r.dedupe, r.context, a.id);
    end loop;
  end loop;
  return n;
end;
$$;

-- A short human name for any record (for previews and run logs).
create or replace function public.automation_record_name(p_org uuid, p_entity text, p_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v text;
begin
  perform public.automation_internal_only();
  case p_entity
    when 'customers' then select name into v from public.customers where id = p_id and organization_id = p_org;
    when 'deals' then select name into v from public.deals where id = p_id and organization_id = p_org;
    when 'leads' then select name into v from public.leads where id = p_id and organization_id = p_org;
    when 'tasks' then select title into v from public.tasks where id = p_id and organization_id = p_org;
    else
      select c.name into v from public.customers c where c.id = public.automation_customer_id(p_org, p_entity, p_id);
  end case;
  return v;
end;
$$;

-- Dry run. Event flows: the records of the last 30 days it would have run on.
-- Date/inactivity flows: who it picks today. Nothing is written.
create or replace function public.automation_preview(p_org uuid, p_trigger jsonb, p_conditions jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  total integer := 0;
  names text[] := array[]::text[];
  nm text;
  since timestamptz := now() - interval '30 days';
  t text := p_trigger->>'type';
  ent text;
begin
  if not public.is_org_member(p_org) then
    raise exception 'not a member' using errcode = '42501';
  end if;
  perform set_config('app.automation_preview', 'on', true);

  if t in ('days_from_date', 'no_activity') then
    for r in select distinct c.record_type, c.record_id from public.automation_candidates(p_org, p_trigger, public.il_today()) c limit 500 loop
      if public.automation_matches(p_org, coalesce(p_conditions, '[]'::jsonb), r.record_type, r.record_id) then
        total := total + 1;
        if total <= 6 then
          nm := public.automation_record_name(p_org, r.record_type, r.record_id);
          if nm is not null then names := array_append(names, nm); end if;
        end if;
      end if;
    end loop;
  else
    ent := case when t = 'deal_stage' then 'deals' else p_trigger->>'entity' end;
    if ent is null or ent not in ('customers', 'transactions', 'activities', 'leads', 'deals', 'tasks') then
      return jsonb_build_object('window', '30d', 'total', 0, 'names', '[]'::jsonb);
    end if;
    for r in execute format(
      'select id from public.%I where organization_id = $1 and created_at >= $2 %s order by created_at desc limit 500',
      ent,
      case
        when t = 'deal_stage' then 'and stage = $3'
        when t = 'status_changed' then 'and status = $3'
        else ''
      end)
      using p_org, since, coalesce(p_trigger->>'stage', p_trigger->>'status', '')
    loop
      if public.automation_matches(p_org, coalesce(p_conditions, '[]'::jsonb), ent, r.id) then
        total := total + 1;
        if total <= 6 then
          nm := public.automation_record_name(p_org, ent, r.id);
          if nm is not null and not nm = any(names) then names := array_append(names, nm); end if;
        end if;
      end if;
    end loop;
  end if;

  return jsonb_build_object(
    'window', case when t in ('days_from_date', 'no_activity') then 'today' else '30d' end,
    'total', total,
    'names', to_jsonb(names));
end;
$$;

grant execute on function public.automation_preview(uuid, jsonb, jsonb) to authenticated;
