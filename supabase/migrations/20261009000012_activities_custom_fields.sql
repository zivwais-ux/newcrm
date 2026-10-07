-- Appointments/activities get the business's own fields too (values keyed by field key, like the other records).
alter table public.activities add column if not exists custom_fields jsonb not null default '{}'::jsonb;
