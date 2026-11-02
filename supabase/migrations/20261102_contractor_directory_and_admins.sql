-- Contractor directory fields + company administrators (Training module, Nov 2026 fixes).
--
-- operations_contractors is the app-wide contractor record (not Training-only), so the fuller
-- business details live on it directly and can be used by other modules later.
-- operations_training_people gains contact details and two flags so a contractor can have
-- several administrators who may or may not also work on jobs (and so need training).
--
-- Safe to re-run: every change is IF NOT EXISTS / guarded.

alter table public.operations_contractors
  add column if not exists legal_name text,
  add column if not exists nzbn text,
  add column if not exists gst_registered boolean,
  add column if not exists gst_number text,
  add column if not exists trade_type text,
  add column if not exists relationship_type text,
  add column if not exists website text,
  add column if not exists main_phone text,
  add column if not exists general_email text,
  add column if not exists accounts_email text,
  add column if not exists physical_address text,
  add column if not exists postal_address text,
  add column if not exists regions text,
  add column if not exists insurance_provider text,
  add column if not exists insurance_policy_number text,
  add column if not exists insurance_expiry date,
  add column if not exists prequalification text,
  add column if not exists notes text;

alter table public.operations_training_people
  add column if not exists is_company_admin boolean not null default false,
  add column if not exists needs_training boolean not null default true,
  add column if not exists phone text,
  add column if not exists email text;

-- Carry the old single "contact" text on each contractor across as a real person, so it
-- is no longer lost: administrators of a company do not need training unless they also work;
-- the one person of a sole trader is the worker and the administrator.
insert into public.operations_training_people
  (person_type, contractor_id, full_name, active, phone, email, is_company_admin, needs_training)
select
  case when c.contractor_type = 'sole_trader' then 'sole_trader' else 'subcontractor_worker' end,
  c.id,
  btrim(c.contact_name),
  c.active,
  nullif(btrim(coalesce(c.contact_phone, '')), ''),
  nullif(btrim(coalesce(c.contact_email, '')), ''),
  true,
  (c.contractor_type = 'sole_trader')
from public.operations_contractors c
where nullif(btrim(coalesce(c.contact_name, '')), '') is not null
  and not exists (
    select 1 from public.operations_training_people p
    where p.contractor_id = c.id
      and lower(btrim(p.full_name)) = lower(btrim(c.contact_name))
  )
  and not (
    c.contractor_type = 'sole_trader'
    and exists (select 1 from public.operations_training_people p where p.contractor_id = c.id)
  );
