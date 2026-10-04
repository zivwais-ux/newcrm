-- Business OS — analytics functions.
-- All functions are SECURITY INVOKER: they run with the caller's privileges,
-- so row level security still restricts results to the caller's organizations.
-- Only paid sales/subscriptions count as revenue; refunds subtract.

create or replace function public.revenue_value(t public.transactions)
returns numeric
language sql
immutable
set search_path = ''
as $$
  select case
    when t.status in ('cancelled') then 0
    when t.type = 'refund' or t.status = 'refunded' then -abs(t.amount)
    else t.amount
  end;
$$;

-- Counts of each canonical entity — drives Component requirements & recommendations.
create or replace function public.data_counts(org uuid)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'customers',    (select count(*) from public.customers where organization_id = org),
    'transactions', (select count(*) from public.transactions where organization_id = org),
    'services',     (select count(*) from public.services where organization_id = org),
    'leads',        (select count(*) from public.leads where organization_id = org),
    'deals',        (select count(*) from public.deals where organization_id = org),
    'activities',   (select count(*) from public.activities where organization_id = org),
    'tasks',        (select count(*) from public.tasks where organization_id = org)
  );
$$;

-- Headline revenue numbers for a date range plus a comparison range.
create or replace function public.revenue_summary(
  org uuid,
  p_from date,
  p_to date,
  p_compare text default 'previous_period'
)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  span integer := (p_to - p_from) + 1;
  c_from date;
  c_to date;
  result jsonb;
  month_start date := date_trunc('month', current_date)::date;
  last_month_start date := (date_trunc('month', current_date) - interval '1 month')::date;
  day_of_month integer := extract(day from current_date)::integer;
begin
  case p_compare
    when 'previous_month' then
      c_from := (p_from - interval '1 month')::date; c_to := (p_to - interval '1 month')::date;
    when 'previous_quarter' then
      c_from := (p_from - interval '3 months')::date; c_to := (p_to - interval '3 months')::date;
    when 'previous_year' then
      c_from := (p_from - interval '1 year')::date; c_to := (p_to - interval '1 year')::date;
    else
      c_from := p_from - span; c_to := p_from - 1;
  end case;

  with tx as (
    select t.date, t.customer_id, public.revenue_value(t) as v
    from public.transactions t
    where t.organization_id = org
  )
  select jsonb_build_object(
    'from', p_from, 'to', p_to,
    'compare_from', c_from, 'compare_to', c_to,
    'total', coalesce(sum(v) filter (where date between p_from and p_to), 0),
    'compare_total', coalesce(sum(v) filter (where date between c_from and c_to), 0),
    'tx_count', count(*) filter (where date between p_from and p_to),
    'compare_tx_count', count(*) filter (where date between c_from and c_to),
    'customers', count(distinct customer_id) filter (where date between p_from and p_to),
    'compare_customers', count(distinct customer_id) filter (where date between c_from and c_to),
    'this_month', coalesce(sum(v) filter (where date >= month_start and date <= current_date), 0),
    'last_month', coalesce(sum(v) filter (where date >= last_month_start and date < month_start), 0),
    'last_month_to_date', coalesce(sum(v) filter (
      where date >= last_month_start
        and date < least(month_start, last_month_start + day_of_month)
    ), 0),
    'all_time', coalesce(sum(v), 0),
    'first_date', min(date),
    'last_date', max(date)
  ) into result
  from tx;

  return result;
end;
$$;

create or replace function public.revenue_by_month(org uuid, p_from date, p_to date)
returns table (month date, revenue numeric, tx_count bigint, customers bigint)
language sql
stable
set search_path = ''
as $$
  with months as (
    select generate_series(date_trunc('month', p_from), date_trunc('month', p_to), interval '1 month')::date as month
  )
  select m.month,
         coalesce(sum(public.revenue_value(t)), 0) as revenue,
         count(t.id) as tx_count,
         count(distinct t.customer_id) as customers
  from months m
  left join public.transactions t
    on t.organization_id = org
   and t.date >= m.month
   and t.date < (m.month + interval '1 month')
   and t.date between p_from and p_to
  group by m.month
  order by m.month;
$$;

create or replace function public.revenue_by_service(org uuid, p_from date, p_to date, p_limit integer default 12)
returns table (name text, revenue numeric, tx_count bigint)
language sql
stable
set search_path = ''
as $$
  select coalesce(nullif(trim(t.product_or_service), ''), 'Uncategorized') as name,
         sum(public.revenue_value(t)) as revenue,
         count(*) as tx_count
  from public.transactions t
  where t.organization_id = org and t.date between p_from and p_to
  group by 1
  order by revenue desc
  limit p_limit;
$$;

-- Period-over-period breakdown: what drove the change in revenue?
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
           coalesce(nullif(trim(t.product_or_service), ''), 'Uncategorized') as service,
           public.revenue_value(t) as v,
           case when t.date between cur_from and cur_to then 'cur'
                when t.date between prev_from and prev_to then 'prev' end as period
    from public.transactions t
    where t.organization_id = org
      and (t.date between cur_from and cur_to or t.date between prev_from and prev_to)
  ),
  first_purchase as (
    select customer_id, min(date) as first_date
    from public.transactions
    where organization_id = org and customer_id is not null
    group by customer_id
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
    'current_tx', (select count(*) from tx where period = 'cur'),
    'previous_tx', (select count(*) from tx where period = 'prev'),
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
         count(*) as purchases,
         max(t.date) as last_purchase
  from public.transactions t
  join public.customers c on c.id = t.customer_id
  where t.organization_id = org and t.date between p_from and p_to
  group by c.id, c.name, c.email
  order by revenue desc
  limit p_limit;
$$;

-- Customer KPIs for Customer Hub.
create or replace function public.customer_stats(org uuid, active_days integer default 90)
returns jsonb
language sql
stable
set search_path = ''
as $$
  with last_seen as (
    select c.id, c.created_at,
           greatest(
             (select max(t.date)::timestamptz from public.transactions t where t.customer_id = c.id),
             (select max(a.date) from public.activities a where a.customer_id = c.id)
           ) as last_seen,
           (select min(t.date) from public.transactions t where t.customer_id = c.id) as first_purchase
    from public.customers c
    where c.organization_id = org
  )
  select jsonb_build_object(
    'total', count(*),
    'new_30d', count(*) filter (where coalesce(first_purchase::timestamptz, created_at) >= now() - interval '30 days'),
    'new_prev_30d', count(*) filter (
      where coalesce(first_purchase::timestamptz, created_at) >= now() - interval '60 days'
        and coalesce(first_purchase::timestamptz, created_at) < now() - interval '30 days'
    ),
    'active', count(*) filter (where last_seen >= now() - make_interval(days => active_days)),
    'active_days', active_days
  )
  from last_seen;
$$;

-- Per-customer purchase rhythm: the basis for repeat & risk analysis.
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
  with tx as (
    select t.customer_id, t.date, public.revenue_value(t) as v,
           t.date - lag(t.date) over (partition by t.customer_id order by t.date) as gap
    from public.transactions t
    where t.organization_id = org and t.customer_id is not null and t.status <> 'cancelled'
  )
  select c.id, c.name, c.email, c.phone,
         count(*) as purchases,
         sum(tx.v) as total_revenue,
         round(avg(tx.v), 2) as avg_ticket,
         min(tx.date) as first_purchase,
         max(tx.date) as last_purchase,
         percentile_cont(0.5) within group (order by tx.gap) filter (where tx.gap is not null)::numeric as median_interval_days,
         greatest(max(tx.date)::timestamptz,
                  (select max(a.date) from public.activities a where a.customer_id = c.id)) as last_activity
  from tx
  join public.customers c on c.id = tx.customer_id
  group by c.id, c.name, c.email, c.phone;
$$;

create or replace function public.repeat_customer_stats(org uuid, overdue_factor numeric default 1.5)
returns jsonb
language sql
stable
set search_path = ''
as $$
  with p as (select * from public.customer_purchase_profile(org))
  select jsonb_build_object(
    'buyers', count(*),
    'repeat', count(*) filter (where purchases >= 2),
    'first_time', count(*) filter (where purchases = 1),
    'repeat_rate', case when count(*) = 0 then 0
                        else round(100.0 * count(*) filter (where purchases >= 2) / count(*), 1) end,
    'overdue', count(*) filter (
      where purchases >= 3 and median_interval_days > 0
        and (current_date - last_purchase) > median_interval_days * overdue_factor
        and (current_date - last_purchase) <= greatest(median_interval_days * 6, 120)
    ),
    'avg_purchases_repeat', round(avg(purchases) filter (where purchases >= 2), 1)
  )
  from p;
$$;

-- Regular customers who are past their normal return interval.
create or replace function public.overdue_customers(org uuid, overdue_factor numeric default 1.5, p_limit integer default 50)
returns table (
  id uuid, name text, email text, phone text, purchases bigint, total_revenue numeric, avg_ticket numeric,
  last_purchase date, median_interval_days numeric, days_since integer
)
language sql
stable
set search_path = ''
as $$
  select id, name, email, phone, purchases, total_revenue, avg_ticket, last_purchase,
         round(median_interval_days, 0), (current_date - last_purchase)::integer
  from public.customer_purchase_profile(org)
  where purchases >= 3 and median_interval_days > 0
    and (current_date - last_purchase) > median_interval_days * overdue_factor
    and (current_date - last_purchase) <= greatest(median_interval_days * 6, 120)
  order by total_revenue desc
  limit p_limit;
$$;

-- Customers whose activity or revenue has dropped.
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
  with p as (select * from public.customer_purchase_profile(org)),
  windows as (
    select t.customer_id,
           coalesce(sum(public.revenue_value(t)) filter (where t.date > current_date - 90), 0) as recent,
           coalesce(sum(public.revenue_value(t)) filter (
             where t.date <= current_date - 90 and t.date > current_date - 180), 0) as previous
    from public.transactions t
    where t.organization_id = org and t.customer_id is not null
    group by t.customer_id
  ),
  scored as (
    select p.*, w.recent, w.previous,
           case when w.previous > 0 then round(100.0 * (w.recent - w.previous) / w.previous, 0) end as change_pct,
           (current_date - p.last_activity::date)::integer as days_since
    from p join windows w on w.customer_id = p.id
    where p.purchases >= 2
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
     or (change_pct is not null and change_pct <= -drop_pct and previous >= 2 * avg_ticket * 0.5)
  order by (coalesce(previous, 0) - coalesce(recent, 0)) desc, total_revenue desc
  limit p_limit;
$$;

-- Open deals that may need attention.
create or replace function public.deals_at_risk(org uuid, idle_days integer default 14, p_limit integer default 50)
returns table (
  id uuid, name text, customer_id uuid, customer_name text, value numeric, stage text,
  owner_id uuid, expected_close date, last_activity timestamptz, days_idle integer, reason text
)
language sql
stable
set search_path = ''
as $$
  with d as (
    select d.*, c.name as customer_name,
           greatest(d.last_activity_at,
                    (select max(a.date) from public.activities a where a.deal_id = d.id)) as last_touch
    from public.deals d
    left join public.customers c on c.id = d.customer_id
    where d.organization_id = org and d.stage not in ('won', 'lost')
  )
  select id, name, customer_id, customer_name, value, stage, owner_id, expected_close, last_touch,
         (current_date - last_touch::date)::integer as days_idle,
         case
           when expected_close < current_date then 'past_close_date'
           else 'no_recent_activity'
         end as reason
  from d
  where (current_date - last_touch::date) >= idle_days or expected_close < current_date
  order by value desc
  limit p_limit;
$$;

create or replace function public.pipeline_summary(org uuid)
returns table (stage text, deals bigint, value numeric)
language sql
stable
set search_path = ''
as $$
  select s.stage, count(d.id), coalesce(sum(d.value), 0)
  from unnest(array['new', 'contacted', 'qualified', 'proposal', 'negotiation', 'won', 'lost'])
       with ordinality as s(stage, ord)
  left join public.deals d on d.stage = s.stage and d.organization_id = org
  group by s.stage, s.ord
  order by s.ord;
$$;

-- Total revenue per customer for a page of customer ids (customer lists).
create or replace function public.customer_revenue(org uuid, ids uuid[])
returns table (customer_id uuid, revenue numeric, purchases bigint, last_purchase date)
language sql
stable
set search_path = ''
as $$
  select t.customer_id, sum(public.revenue_value(t)), count(*), max(t.date)
  from public.transactions t
  where t.organization_id = org and t.customer_id = any (ids)
  group by t.customer_id;
$$;

-- Customers who bought in the previous period but not in the current one.
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
           max(t.date) filter (where t.date <= cur_to) as last_purchase,
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

do $$
declare
  f text;
begin
  foreach f in array array[
    'data_counts(uuid)',
    'revenue_summary(uuid, date, date, text)',
    'revenue_by_month(uuid, date, date)',
    'revenue_by_service(uuid, date, date, integer)',
    'revenue_change_breakdown(uuid, date, date, date, date)',
    'top_customers(uuid, date, date, integer)',
    'customer_stats(uuid, integer)',
    'customer_purchase_profile(uuid)',
    'repeat_customer_stats(uuid, numeric)',
    'overdue_customers(uuid, numeric, integer)',
    'customers_at_risk(uuid, integer, numeric, integer)',
    'deals_at_risk(uuid, integer, integer)',
    'pipeline_summary(uuid)',
    'customer_revenue(uuid, uuid[])',
    'lapsed_customers(uuid, date, date, date, date, integer)'
  ] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end;
$$;
