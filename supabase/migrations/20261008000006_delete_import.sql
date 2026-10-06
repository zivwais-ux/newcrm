-- Deleting an uploaded file, optionally together with everything it imported.
-- SECURITY INVOKER: every delete still passes RLS; owners/admins only.

-- What deleting this import would remove (shown before the user confirms).
create or replace function public.import_impact(p_import uuid)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'transactions', (select count(*) from public.transactions where source_import_id = p_import),
    'activities',   (select count(*) from public.activities where source_import_id = p_import),
    'deals',        (select count(*) from public.deals where source_import_id = p_import),
    'leads',        (select count(*) from public.leads where source_import_id = p_import),
    'customers',    (select count(*) from public.customers where source_import_id = p_import)
  );
$$;

create or replace function public.delete_import(p_import uuid, p_with_data boolean default true)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  f record;
  svc uuid[];
  n_tx integer := 0;
  n_act integer := 0;
  n_deals integer := 0;
  n_leads integer := 0;
  n_customers integer := 0;
  n_kept integer := 0;
  n_services integer := 0;
begin
  select id, organization_id, data_source_id, storage_path into f
  from public.imported_files where id = p_import;
  if not found then
    raise exception 'import not found' using errcode = 'P0002';
  end if;
  if not public.has_org_role(f.organization_id, array['owner', 'admin']::public.member_role[]) then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  if p_with_data then
    select coalesce(array_agg(distinct service_id) filter (where service_id is not null), '{}')
      into svc from public.transactions where source_import_id = p_import;

    delete from public.transactions where source_import_id = p_import;
    get diagnostics n_tx = row_count;
    delete from public.activities where source_import_id = p_import;
    get diagnostics n_act = row_count;
    delete from public.deals where source_import_id = p_import;
    get diagnostics n_deals = row_count;
    delete from public.leads where source_import_id = p_import;
    get diagnostics n_leads = row_count;

    -- A customer created by this file is removed only if nothing else refers to them
    -- (manual sales, other imports, tasks, appointments…). Otherwise they stay.
    delete from public.customers c
    where c.source_import_id = p_import
      and not exists (select 1 from public.transactions t where t.customer_id = c.id)
      and not exists (select 1 from public.activities a where a.customer_id = c.id)
      and not exists (select 1 from public.deals d where d.customer_id = c.id)
      and not exists (select 1 from public.tasks k where k.customer_id = c.id)
      and not exists (select 1 from public.leads l where l.customer_id = c.id);
    get diagnostics n_customers = row_count;

    -- Services this file introduced that no sale uses any more.
    delete from public.services s
    where s.id = any (svc)
      and not exists (select 1 from public.transactions t where t.service_id = s.id);
    get diagnostics n_services = row_count;
  end if;

  update public.customers set source_import_id = null where source_import_id = p_import;
  get diagnostics n_kept = row_count;

  delete from public.imported_files where id = p_import;
  if f.data_source_id is not null then
    delete from public.data_sources ds
    where ds.id = f.data_source_id
      and not exists (select 1 from public.imported_files i where i.data_source_id = ds.id);
  end if;
  delete from public.ai_briefs where organization_id = f.organization_id;

  return jsonb_build_object(
    'transactions', n_tx, 'activities', n_act, 'deals', n_deals, 'leads', n_leads,
    'customers', n_customers, 'customers_kept', n_kept, 'services', n_services,
    'storage_path', f.storage_path
  );
end;
$$;

revoke execute on function public.import_impact(uuid) from public, anon;
revoke execute on function public.delete_import(uuid, boolean) from public, anon;
grant execute on function public.import_impact(uuid) to authenticated;
grant execute on function public.delete_import(uuid, boolean) to authenticated;
