-- Round 22: vehicle holders (who drives which vehicle), vehicle-check reminders, and a people list for task assignment.
-- Adds: operations_vehicle_holders (one person per vehicle, one vehicle per person),
-- RPCs vehicle_holder_overview / claim_my_vehicle / admin_set_vehicle_holder / assignable_people,
-- and the 'vehicle_check_due' notification event type. No existing data is changed.

create table if not exists public.operations_vehicle_holders (
  vehicle_id uuid primary key references public.operations_vehicles(id) on delete cascade,
  user_id uuid not null unique references auth.users(id) on delete cascade,
  assigned_at timestamptz not null default now(),
  assigned_by uuid references auth.users(id) on delete set null
);

alter table public.operations_vehicle_holders enable row level security;
-- No direct table access: everything goes through the functions below.
revoke all on public.operations_vehicle_holders from public, anon, authenticated;
grant all on public.operations_vehicle_holders to service_role;

alter table public.operations_notifications drop constraint if exists operations_notifications_event_type_check;
alter table public.operations_notifications add constraint operations_notifications_event_type_check
  check (event_type = any (array['task_assigned','vehicle_issue_created','due_soon','overdue','critical_escalation','weekly_summary','vehicle_check_due']));

create or replace function public.vehicle_holder_overview()
returns table (vehicle_id uuid, rego text, name text, status text, holder_user_id uuid, holder_name text)
language sql
security definer
set search_path = public
as $$
  select v.id, v.rego, v.name, v.status, h.user_id,
         coalesce(nullif(btrim(p.display_name), ''), p.email, 'Unknown user')
  from public.operations_vehicles v
  left join public.operations_vehicle_holders h on h.vehicle_id = v.id
  left join public.profiles p on p.user_id = h.user_id
  where public.spray_wash_has_role(array['Admin','Maintenance manager','Vehicle inspector'])
  order by coalesce(v.rego, v.name);
$$;

create or replace function public.claim_my_vehicle(p_vehicle_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  holder uuid;
  holder_name text;
begin
  if me is null or not public.spray_wash_has_role(array['Admin','Maintenance manager','Vehicle inspector']) then
    raise exception 'Your account cannot choose a vehicle.';
  end if;
  if p_vehicle_id is null then
    delete from public.operations_vehicle_holders where user_id = me;
    return;
  end if;
  if not exists (select 1 from public.operations_vehicles where id = p_vehicle_id) then
    raise exception 'That vehicle does not exist.';
  end if;
  select h.user_id into holder from public.operations_vehicle_holders h where h.vehicle_id = p_vehicle_id;
  if holder is not null and holder <> me then
    select coalesce(nullif(btrim(p.display_name), ''), p.email, 'someone else') into holder_name from public.profiles p where p.user_id = holder;
    raise exception 'This vehicle is already held by %. Ask them to choose "No Vehicle Assigned" first, or ask an Admin to reassign it.', coalesce(holder_name, 'someone else');
  end if;
  delete from public.operations_vehicle_holders where user_id = me;
  insert into public.operations_vehicle_holders (vehicle_id, user_id, assigned_by) values (p_vehicle_id, me, me)
    on conflict (vehicle_id) do update set user_id = excluded.user_id, assigned_at = now(), assigned_by = excluded.assigned_by;
end;
$$;

create or replace function public.admin_set_vehicle_holder(p_vehicle_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.spray_wash_has_role(array['Admin']) then
    raise exception 'Admin access is required.';
  end if;
  if p_vehicle_id is null then
    raise exception 'Choose a vehicle.';
  end if;
  delete from public.operations_vehicle_holders where vehicle_id = p_vehicle_id;
  if p_user_id is not null then
    delete from public.operations_vehicle_holders where user_id = p_user_id;
    insert into public.operations_vehicle_holders (vehicle_id, user_id, assigned_by) values (p_vehicle_id, p_user_id, auth.uid());
  end if;
end;
$$;

create or replace function public.assignable_people()
returns table (user_id uuid, display_name text)
language sql
security definer
set search_path = public
as $$
  select a.user_id, coalesce(nullif(btrim(p.display_name), ''), p.email, 'Unknown user')
  from public.app_user_access a
  left join public.profiles p on p.user_id = a.user_id
  where a.status = 'Active'
    and public.spray_wash_has_role(array['Admin','Maintenance manager'])
  order by 2;
$$;

revoke all on function public.vehicle_holder_overview() from public, anon;
revoke all on function public.claim_my_vehicle(uuid) from public, anon;
revoke all on function public.admin_set_vehicle_holder(uuid, uuid) from public, anon;
revoke all on function public.assignable_people() from public, anon;
grant execute on function public.vehicle_holder_overview() to authenticated;
grant execute on function public.claim_my_vehicle(uuid) to authenticated;
grant execute on function public.admin_set_vehicle_holder(uuid, uuid) to authenticated;
grant execute on function public.assignable_people() to authenticated;
