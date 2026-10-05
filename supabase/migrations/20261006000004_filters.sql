-- Workspace filters: service-scoped analytics so Components can react to a
-- service selected in another Component. SECURITY INVOKER — RLS still applies.

-- Customers who bought a given service/product, with their purchase stats for it.
create or replace function public.service_customers(org uuid, p_service text)
returns table (customer_id uuid, purchases bigint, revenue numeric, first_purchase date, last_purchase date)
language sql
stable
set search_path = ''
as $$
  select t.customer_id, count(*), sum(public.revenue_value(t)), min(t.date), max(t.date)
  from public.transactions t
  where t.organization_id = org and t.customer_id is not null and t.product_or_service = p_service
  group by t.customer_id;
$$;

-- revenue_summary with an optional service filter.
create or replace function public.revenue_summary_filtered(
  org uuid, p_from date, p_to date, p_compare text default 'previous_period', p_service text default null
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
    where t.organization_id = org and (p_service is null or t.product_or_service = p_service)
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
      where date >= last_month_start and date < least(month_start, last_month_start + day_of_month)
    ), 0),
    'all_time', coalesce(sum(v), 0),
    'first_date', min(date),
    'last_date', max(date)
  ) into result
  from tx;
  return result;
end;
$$;

-- revenue_by_month with an optional service filter.
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
         count(t.id),
         count(distinct t.customer_id)
  from months m
  left join public.transactions t
    on t.organization_id = org
   and t.date >= m.month
   and t.date < (m.month + interval '1 month')
   and t.date between p_from and p_to
   and (p_service is null or t.product_or_service = p_service)
  group by m.month
  order by m.month;
$$;

revoke execute on function public.service_customers(uuid, text) from public, anon;
revoke execute on function public.revenue_summary_filtered(uuid, date, date, text, text) from public, anon;
revoke execute on function public.revenue_by_month_filtered(uuid, date, date, text) from public, anon;
grant execute on function public.service_customers(uuid, text) to authenticated;
grant execute on function public.revenue_summary_filtered(uuid, date, date, text, text) to authenticated;
grant execute on function public.revenue_by_month_filtered(uuid, date, date, text) to authenticated;
