-- Analytics correctness pass.
-- * Only paid sales count as revenue; pending/cancelled/refunded sales are 0; refund rows subtract once.
-- * A "purchase" is a distinct paid sale date per customer (multi-line receipts count once).
-- * "Today" is the business day in Israel, not the server's UTC date.
-- * Last activity ignores automatic WhatsApp logs and future appointments.
-- * Service names are matched the same way everywhere (trimmed, "ללא שירות" for blanks).
-- All functions stay SECURITY INVOKER with an empty search_path, so RLS scopes every query.

create or replace function public.il_today()
returns date
language sql
stable
set search_path = ''
as $$ select (now() at time zone 'Asia/Jerusalem')::date; $$;

create or replace function public.service_label(p text)
returns text
language sql
immutable
set search_path = ''
as $$ select coalesce(nullif(btrim(p), ''), 'ללא שירות'); $$;

create or replace function public.revenue_value(t public.transactions)
returns numeric
language sql
immutable
set search_path = ''
as $$
  select case
    when t.type = 'refund' then case when t.status = 'cancelled' then 0 else -abs(t.amount) end
    when t.status = 'paid' then t.amount
    else 0
  end;
$$;

-- True for rows that represent an actual paid sale (not a refund, not pending/cancelled).
create or replace function public.is_paid_sale(t public.transactions)
returns boolean
language sql
immutable
set search_path = ''
as $$ select t.type <> 'refund' and t.status = 'paid'; $$;

create index if not exists transactions_org_service_idx
  on public.transactions (organization_id, public.service_label(product_or_service));
create index if not exists transactions_org_customer_date_idx
  on public.transactions (organization_id, customer_id, date);
create index if not exists activities_org_customer_date_idx
  on public.activities (organization_id, customer_id, date);

-- ---------------------------------------------------------------------------
-- Revenue

create or replace function public.revenue_summary_filtered(
  org uuid, p_from date, p_to date, p_compare text default 'previous_period', p_service text default null
)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  today date := public.il_today();
  span integer := (p_to - p_from) + 1;
  c_from date;
  c_to date;
  result jsonb;
  month_start date := date_trunc('month', today)::date;
  last_month_start date := (date_trunc('month', today) - interval '1 month')::date;
  day_of_month integer := extract(day from today)::integer;
begin
  -- Month/quarter comparisons only make sense for ranges that fit in them;
  -- longer ranges compare against the same-length period right before.
  if p_compare = 'previous_month' and span <= 31 then
    c_from := (p_from - interval '1 month')::date; c_to := (p_to - interval '1 month')::date;
  elsif p_compare = 'previous_quarter' and span <= 92 then
    c_from := (p_from - interval '3 months')::date; c_to := (p_to - interval '3 months')::date;
  elsif p_compare = 'previous_year' then
    c_from := (p_from - interval '1 year')::date; c_to := (p_to - interval '1 year')::date;
  else
    c_from := p_from - span; c_to := p_from - 1;
  end if;

  with tx as (
    select t.date, t.customer_id, public.revenue_value(t) as v, public.is_paid_sale(t) as sale
    from public.transactions t
    where t.organization_id = org
      and (p_service is null or public.service_label(t.product_or_service) = p_service)
  )
  select jsonb_build_object(
    'from', p_from, 'to', p_to,
    'compare_from', c_from, 'compare_to', c_to,
    'total', coalesce(sum(v) filter (where date between p_from and p_to), 0),
    'compare_total', coalesce(sum(v) filter (where date between c_from and c_to), 0),
    'tx_count', count(*) filter (where sale and date between p_from and p_to),
    'compare_tx_count', count(*) filter (where sale and date between c_from and c_to),
    'sale_count', count(*) filter (where sale and date between p_from and p_to),
    'customers', count(distinct customer_id) filter (where sale and date between p_from and p_to),
    'compare_customers', count(distinct customer_id) filter (where sale and date between c_from and c_to),
    'this_month', coalesce(sum(v) filter (where date >= month_start and date <= today), 0),
    'last_month', coalesce(sum(v) filter (where date >= last_month_start and date < month_start), 0),
    'last_month_to_date', coalesce(sum(v) filter (
      where date >= last_month_start and date < least(month_start, last_month_start + day_of_month)
    ), 0),
    'pending_total', coalesce((
      select sum(t.amount) from public.transactions t
      where t.organization_id = org and t.status = 'pending' and t.type <> 'refund'
        and (p_service is null or public.service_label(t.product_or_service) = p_service)
    ), 0),
    'all_time', coalesce(sum(v), 0),
    'first_date', min(date),
    'last_date', max(date)
  ) into result
  from tx;
  return result;
end;
$$;

create or replace function public.revenue_summary(org uuid, p_from date, p_to date, p_compare text default 'previous_period')
returns jsonb
language sql
stable
set search_path = ''
as $$ select public.revenue_summary_filtered(org, p_from, p_to, p_compare, null); $$;

create or replace function public.revenue_by_month_filtered(org uuid, p_from date, p_to date, p_service text default null)
returns table (month date, revenue numeric, tx_count bigint, customers bigint)
language sql
stable
set search_path = ''
as $$
  with months as (
    select generate_series(date_trunc('month', p_from), date_trunc('month', p_to), interval '1 month')::date as month
  )
  select m.month,
         coalesce(sum(public.revenue_value(t)), 0),
         count(t.id) filter (where public.is_paid_sale(t)),
         count(distinct t.customer_id) filter (where public.is_paid_sale(t))
  from months m
  left join public.transactions t
    on t.organization_id = org
   and t.date >= m.month
   and t.date < (m.month + interval '1 month')
   and t.date between p_from and p_to
   and (p_service is null or public.service_label(t.product_or_service) = p_service)
  group by m.month
  order by m.month;
$$;

create or replace function public.revenue_by_month(org uuid, p_from date, p_to date)
returns table (month date, revenue numeric, tx_count bigint, customers bigint)
language sql
stable
set search_path = ''
as $$ select * from public.revenue_by_month_filtered(org, p_from, p_to, null); $$;

create or replace function public.revenue_by_service(org uuid, p_from date, p_to date, p_limit integer default 12)
returns table (name text, revenue numeric, tx_count bigint)
language sql
stable
set search_path = ''
as $$
  select public.service_label(t.product_or_service) as name,
         sum(public.revenue_value(t)) as revenue,
         count(*) filter (where public.is_paid_sale(t)) as tx_count
  from public.transactions t
  where t.organization_id = org and t.date between p_from and p_to
  group by 1
  having sum(public.revenue_value(t)) <> 0 or count(*) filter (where public.is_paid_sale(t)) > 0
  order by revenue desc
  limit p_limit;
$$;

create or replace function public.revenue_change_breakdown(
  org uuid, cur_from date, cur_to date, prev_from date, prev_to date
)
returns jsonb
language sql
stable
set search_path = ''
as $$
  with tx as (
    select t.customer_id,
           public.service_label(t.product_or_service) as service,
           public.revenue_value(t) as v,
           public.is_paid_sale(t) as sale,
           case when t.date between cur_from and cur_to then 'cur'
                when t.date between prev_from and prev_to then 'prev' end as period
    from public.transactions t
    where t.organization_id = org
      and (t.date between cur_from and cur_to or t.date between prev_from and prev_to)
  ),
  first_purchase as (
    select t.customer_id, min(t.date) as first_date
    from public.transactions t
    where t.organization_id = org and t.customer_id is not null and public.is_paid_sale(t)
    group by t.customer_id
  ),
  per_customer as (
    select customer_id,
           coalesce(sum(v) filter (where period = 'cur'), 0) as cur,
           coalesce(sum(v) filter (where period = 'prev'), 0) as prev
    from tx where customer_id is not null
    group by customer_id
  ),
  per_service as (
    select service,
           coalesce(sum(v) filter (where period = 'cur'), 0) as cur,
           coalesce(sum(v) filter (where period = 'prev'), 0) as prev
    from tx group by service
  )
  select jsonb_build_object(
    'current_total', (select coalesce(sum(v), 0) from tx where period = 'cur'),
    'previous_total', (select coalesce(sum(v), 0) from tx where period = 'prev'),
    'current_tx', (select count(*) from tx where period = 'cur' and sale),
    'previous_tx', (select count(*) from tx where period = 'prev' and sale),
    'current_customers', (select count(*) from per_customer where cur > 0),
    'previous_customers', (select count(*) from per_customer where prev > 0),
    'retained_customers', (select count(*) from per_customer where cur > 0 and prev > 0),
    'lost_customers', (select count(*) from per_customer where prev > 0 and cur <= 0),
    'lost_customers_revenue', (select coalesce(sum(prev), 0) from per_customer where prev > 0 and cur <= 0),
    'new_customers', (
      select count(*) from per_customer pc join first_purchase fp using (customer_id)
      where pc.cur > 0 and fp.first_date >= cur_from
    ),
    'new_customers_revenue', (
      select coalesce(sum(pc.cur), 0) from per_customer pc join first_purchase fp using (customer_id)
      where pc.cur > 0 and fp.first_date >= cur_from
    ),
    'retained_revenue_change', (
      select coalesce(sum(cur - prev), 0) from per_customer where cur > 0 and prev > 0
    ),
    'services', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'service', service, 'current', cur, 'previous', prev, 'change', cur - prev
      ) order by abs(cur - prev) desc), '[]'::jsonb)
      from (select * from per_service order by abs(cur - prev) desc limit 8) s
    )
  );
$$;

create or replace function public.top_customers(org uuid, p_from date, p_to date, p_limit integer default 10)
returns table (id uuid, name text, email text, revenue numeric, purchases bigint, last_purchase date)
language sql
stable
set search_path = ''
as $$
  select c.id, c.name, c.email,
         sum(public.revenue_value(t)) as revenue,
         count(distinct t.date) filter (where public.is_paid_sale(t)) as purchases,
         max(t.date) filter (where public.is_paid_sale(t)) as last_purchase
  from public.transactions t
  join public.customers c on c.id = t.customer_id
  where t.organization_id = org and t.date between p_from and p_to
  group by c.id, c.name, c.email
  having sum(public.revenue_value(t)) > 0
  order by revenue desc
  limit p_limit;
$$;

create or replace function public.customer_revenue(org uuid, ids uuid[])
returns table (customer_id uuid, revenue numeric, purchases bigint, last_purchase date)
language sql
stable
set search_path = ''
as $$
  select t.customer_id,
         sum(public.revenue_value(t)),
         count(distinct t.date) filter (where public.is_paid_sale(t)),
         max(t.date) filter (where public.is_paid_sale(t))
  from public.transactions t
  where t.organization_id = org and t.customer_id = any (ids)
  group by t.customer_id;
$$;

create or replace function public.service_customers(org uuid, p_service text)
returns table (customer_id uuid, purchases bigint, revenue numeric, first_purchase date, last_purchase date)
language sql
stable
set search_path = ''
as $$
  select t.customer_id,
         count(distinct t.date) filter (where public.is_paid_sale(t)),
         sum(public.revenue_value(t)),
         min(t.date) filter (where public.is_paid_sale(t)),
         max(t.date) filter (where public.is_paid_sale(t))
  from public.transactions t
  where t.organization_id = org and t.customer_id is not null
    and public.service_label(t.product_or_service) = p_service
  group by t.customer_id
  having count(*) filter (where public.is_paid_sale(t)) > 0;
$$;

-- ---------------------------------------------------------------------------
-- Customers

create or replace function public.customer_stats(org uuid, active_days integer default 90)
returns jsonb
language sql
stable
set search_path = ''
as $$
  with today as (select public.il_today() as d),
  tx as (
    select t.customer_id, min(t.date) as first_purchase, max(t.date) as last_purchase
    from public.transactions t
    where t.organization_id = org and t.customer_id is not null and public.is_paid_sale(t)
    group by t.customer_id
  ),
  act as (
    select a.customer_id, max(a.date) as last_activity
    from public.activities a
    where a.organization_id = org and a.customer_id is not null and a.type <> 'whatsapp' and a.date <= now()
    group by a.customer_id
  ),
  c as (
    select cu.id, tx.first_purchase,
           greatest(tx.last_purchase, (act.last_activity at time zone 'Asia/Jerusalem')::date) as last_seen
    from public.customers cu
    left join tx on tx.customer_id = cu.id
    left join act on act.customer_id = cu.id
    where cu.organization_id = org
  )
  select jsonb_build_object(
    'total', count(*),
    'new_30d', count(*) filter (where first_purchase > (select d from today) - 30),
    'new_prev_30d', count(*) filter (
      where first_purchase > (select d from today) - 60 and first_purchase <= (select d from today) - 30
    ),
    'active', count(*) filter (where last_seen > (select d from today) - active_days),
    'active_days', active_days
  )
  from c;
$$;

create or replace function public.customer_purchase_profile(org uuid)
returns table (
  id uuid, name text, email text, phone text,
  purchases bigint, total_revenue numeric, avg_ticket numeric,
  first_purchase date, last_purchase date, median_interval_days numeric,
  last_activity timestamptz
)
language sql
stable
set search_path = ''
as $$
  with visits as (
    -- One row per customer per day with a paid sale: a multi-line receipt is one purchase.
    select t.customer_id, t.date, sum(t.amount) as v
    from public.transactions t
    where t.organization_id = org and t.customer_id is not null and public.is_paid_sale(t)
    group by t.customer_id, t.date
  ),
  gaps as (
    select v.*, v.date - lag(v.date) over (partition by v.customer_id order by v.date) as gap
    from visits v
  ),
  net as (
    select t.customer_id, sum(public.revenue_value(t)) as revenue
    from public.transactions t
    where t.organization_id = org and t.customer_id is not null
    group by t.customer_id
  ),
  act as (
    select a.customer_id, max(a.date) as last_activity
    from public.activities a
    where a.organization_id = org and a.customer_id is not null and a.type <> 'whatsapp' and a.date <= now()
    group by a.customer_id
  )
  select c.id, c.name, c.email, c.phone,
         count(*) as purchases,
         max(net.revenue) as total_revenue,
         round(avg(g.v), 2) as avg_ticket,
         min(g.date) as first_purchase,
         max(g.date) as last_purchase,
         percentile_cont(0.5) within group (order by g.gap) filter (where g.gap is not null)::numeric as median_interval_days,
         greatest(max(g.date)::timestamp at time zone 'Asia/Jerusalem', max(act.last_activity)) as last_activity
  from gaps g
  join public.customers c on c.id = g.customer_id
  left join net on net.customer_id = g.customer_id
  left join act on act.customer_id = g.customer_id
  group by c.id, c.name, c.email, c.phone;
$$;

create or replace function public.repeat_customer_stats(org uuid, overdue_factor numeric default 1.5)
returns jsonb
language sql
stable
set search_path = ''
as $$
  with p as (select * from public.customer_purchase_profile(org)), today as (select public.il_today() as d)
  select jsonb_build_object(
    'buyers', count(*),
    'repeat', count(*) filter (where purchases >= 2),
    'first_time', count(*) filter (where purchases = 1),
    'repeat_rate', case when count(*) = 0 then 0
                        else round(100.0 * count(*) filter (where purchases >= 2) / count(*), 1) end,
    'overdue', count(*) filter (
      where purchases >= 3 and median_interval_days > 0
        and ((select d from today) - last_purchase) > median_interval_days * overdue_factor
        and ((select d from today) - last_purchase) <= greatest(median_interval_days * 6, 120)
    ),
    'avg_purchases_repeat', coalesce(round(avg(purchases) filter (where purchases >= 2), 1), 0)
  )
  from p;
$$;

create or replace function public.overdue_customers(org uuid, overdue_factor numeric default 1.5, p_limit integer default 50)
returns table (
  id uuid, name text, email text, phone text, purchases bigint, total_revenue numeric, avg_ticket numeric,
  last_purchase date, median_interval_days numeric, days_since integer
)
language sql
stable
set search_path = ''
as $$
  with today as (select public.il_today() as d)
  select id, name, email, phone, purchases, total_revenue, avg_ticket, last_purchase,
         round(median_interval_days, 0), ((select d from today) - last_purchase)::integer
  from public.customer_purchase_profile(org)
  where purchases >= 3 and median_interval_days > 0
    and ((select d from today) - last_purchase) > median_interval_days * overdue_factor
    and ((select d from today) - last_purchase) <= greatest(median_interval_days * 6, 120)
  order by total_revenue desc
  limit p_limit;
$$;

-- Customers who bought only once — worth inviting back.
create or replace function public.one_time_customers(org uuid, min_days integer default 30, p_limit integer default 50)
returns table (id uuid, name text, phone text, total_revenue numeric, last_purchase date, days_since integer)
language sql
stable
set search_path = ''
as $$
  with today as (select public.il_today() as d)
  select id, name, phone, total_revenue, last_purchase, ((select d from today) - last_purchase)::integer
  from public.customer_purchase_profile(org)
  where purchases = 1
    and ((select d from today) - last_purchase) >= min_days
    and ((select d from today) - last_purchase) <= 365
  order by total_revenue desc, last_purchase desc
  limit p_limit;
$$;

-- Customers whose buying slowed or stopped, judged against their own rhythm.
create or replace function public.customers_at_risk(
  org uuid,
  inactive_days integer default 60,
  drop_pct numeric default 30,
  p_limit integer default 50
)
returns table (
  id uuid, name text, email text, phone text,
  recent_revenue numeric, previous_revenue numeric, change_pct numeric,
  avg_ticket numeric, total_revenue numeric, purchases bigint,
  last_activity timestamptz, days_since integer, reason text
)
language sql
stable
set search_path = ''
as $$
  with today as (select public.il_today() as d),
  p as (
    select pr.*,
           -- Window = ~3 of the customer's usual gaps, between 60 days and a year.
           greatest(60, least(365, ceil(coalesce(pr.median_interval_days, 30) * 3)))::integer as win
    from public.customer_purchase_profile(org) pr
    where pr.purchases >= 2
  ),
  windows as (
    select p.id,
           coalesce(sum(public.revenue_value(t)) filter (where t.date > (select d from today) - p.win), 0) as recent,
           coalesce(sum(public.revenue_value(t)) filter (
             where t.date <= (select d from today) - p.win and t.date > (select d from today) - 2 * p.win), 0) as previous
    from p
    join public.transactions t on t.customer_id = p.id and t.organization_id = org
    group by p.id
  ),
  scored as (
    select p.*, w.recent, w.previous,
           case when w.previous > 0 then round(100.0 * (w.recent - w.previous) / w.previous, 0) end as change_pct,
           ((select d from today) - (p.last_activity at time zone 'Asia/Jerusalem')::date)::integer as days_since
    from p join windows w on w.id = p.id
  )
  select id, name, email, phone, recent, previous, change_pct, avg_ticket, total_revenue, purchases,
         last_activity, days_since,
         case
           when days_since >= inactive_days and change_pct is not null and change_pct <= -drop_pct
             then 'revenue_drop_and_inactive'
           when days_since >= inactive_days then 'inactive'
           else 'revenue_drop'
         end as reason
  from scored
  where (days_since >= inactive_days and days_since <= greatest(inactive_days * 4, 365))
     or (change_pct is not null and change_pct <= -drop_pct and previous >= avg_ticket)
  order by (coalesce(previous, 0) - coalesce(recent, 0)) desc, total_revenue desc
  limit p_limit;
$$;

create or replace function public.lapsed_customers(
  org uuid, cur_from date, cur_to date, prev_from date, prev_to date, p_limit integer default 50
)
returns table (id uuid, name text, email text, phone text, previous_revenue numeric, last_purchase date, lifetime_revenue numeric)
language sql
stable
set search_path = ''
as $$
  with per as (
    select t.customer_id,
           coalesce(sum(public.revenue_value(t)) filter (where t.date between prev_from and prev_to), 0) as prev,
           coalesce(sum(public.revenue_value(t)) filter (where t.date between cur_from and cur_to), 0) as cur,
           max(t.date) filter (where t.date <= cur_to and public.is_paid_sale(t)) as last_purchase,
           sum(public.revenue_value(t)) as lifetime
    from public.transactions t
    where t.organization_id = org and t.customer_id is not null
    group by t.customer_id
  )
  select c.id, c.name, c.email, c.phone, per.prev, per.last_purchase, per.lifetime
  from per join public.customers c on c.id = per.customer_id
  where per.prev > 0 and per.cur <= 0
  order by per.prev desc, per.lifetime desc
  limit p_limit;
$$;

-- ---------------------------------------------------------------------------
-- Deals

create or replace function public.deals_at_risk(org uuid, idle_days integer default 14, p_limit integer default 50)
returns table (
  id uuid, name text, customer_id uuid, customer_name text, value numeric, stage text,
  owner_id uuid, expected_close date, last_activity timestamptz, days_idle integer, reason text
)
language sql
stable
set search_path = ''
as $$
  with today as (select public.il_today() as d),
  d as (
    select d.*, c.name as customer_name,
           greatest(d.last_activity_at,
                    (select max(a.date) from public.activities a
                      where a.deal_id = d.id and a.date <= now())) as last_touch
    from public.deals d
    left join public.customers c on c.id = d.customer_id
    where d.organization_id = org and d.stage not in ('won', 'lost')
  ),
  scored as (
    select d.*, greatest(0, ((select x.d from today x) - (d.last_touch at time zone 'Asia/Jerusalem')::date))::integer as idle
    from d
  )
  select id, name, customer_id, customer_name, value, stage, owner_id, expected_close, last_touch,
         idle as days_idle,
         case when expected_close < (select x.d from today x) then 'past_close_date' else 'no_recent_activity' end as reason
  from scored
  where idle >= idle_days or expected_close < (select x.d from today x)
  -- Most urgent first: long silence on valuable deals, overdue closes before others.
  order by (expected_close < (select x.d from today x)) desc, idle * greatest(value, 1) desc
  limit p_limit;
$$;

-- ---------------------------------------------------------------------------
-- One canvas entry per Component type per organization (prevents double-add).

-- (Verified before applying: no duplicate (organization_id, component_type) rows existed.)
create unique index if not exists components_org_type_uidx on public.components (organization_id, component_type);

do $$
declare
  f text;
begin
  foreach f in array array[
    'il_today()',
    'service_label(text)',
    'is_paid_sale(public.transactions)',
    'revenue_summary_filtered(uuid, date, date, text, text)',
    'revenue_summary(uuid, date, date, text)',
    'revenue_by_month_filtered(uuid, date, date, text)',
    'revenue_by_month(uuid, date, date)',
    'revenue_by_service(uuid, date, date, integer)',
    'revenue_change_breakdown(uuid, date, date, date, date)',
    'top_customers(uuid, date, date, integer)',
    'customer_revenue(uuid, uuid[])',
    'service_customers(uuid, text)',
    'customer_stats(uuid, integer)',
    'customer_purchase_profile(uuid)',
    'repeat_customer_stats(uuid, numeric)',
    'overdue_customers(uuid, numeric, integer)',
    'one_time_customers(uuid, integer, integer)',
    'customers_at_risk(uuid, integer, numeric, integer)',
    'lapsed_customers(uuid, date, date, date, date, integer)',
    'deals_at_risk(uuid, integer, integer)'
  ] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end;
$$;
