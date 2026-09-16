-- Maintenance module bug-fix batch (15 Sep 2026)
--
-- 1. Adds operations_asset_files + the asset-files storage bucket so vehicles
--    and machinery/sub-assets can carry document attachments (e.g. maintenance
--    manual PDFs), mirroring the existing operations_training_record_files /
--    training-evidence pattern.
-- 2. Does not change config.js and does not touch production data.

create table if not exists public.operations_asset_files (
  id uuid primary key default gen_random_uuid(),
  target_type text not null check (target_type in ('vehicle','washing_equipment')),
  vehicle_id uuid references public.operations_vehicles(id) on delete cascade,
  washing_equipment_id uuid references public.operations_washing_equipment(id) on delete cascade,
  storage_path text not null,
  file_name text not null,
  file_size_bytes integer not null,
  uploaded_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint operations_asset_files_target_check check (
    (target_type = 'vehicle' and vehicle_id is not null and washing_equipment_id is null)
    or (target_type = 'washing_equipment' and washing_equipment_id is not null and vehicle_id is null)
  )
);

create index if not exists operations_asset_files_vehicle_idx on public.operations_asset_files(vehicle_id);
create index if not exists operations_asset_files_washing_equipment_idx on public.operations_asset_files(washing_equipment_id);

alter table public.operations_asset_files enable row level security;

drop policy if exists "operations_asset_files select maintenance" on public.operations_asset_files;
create policy "operations_asset_files select maintenance"
  on public.operations_asset_files for select
  to authenticated
  using (public.spray_wash_has_role(array['Admin','Maintenance manager','Vehicle inspector']));

drop policy if exists "operations_asset_files insert maintenance manager" on public.operations_asset_files;
create policy "operations_asset_files insert maintenance manager"
  on public.operations_asset_files for insert
  to authenticated
  with check (public.spray_wash_has_role(array['Admin','Maintenance manager']));

drop policy if exists "operations_asset_files delete maintenance manager" on public.operations_asset_files;
create policy "operations_asset_files delete maintenance manager"
  on public.operations_asset_files for delete
  to authenticated
  using (public.spray_wash_has_role(array['Admin','Maintenance manager']));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('asset-files', 'asset-files', false, 20971520, array['application/pdf','image/jpeg','image/png','image/webp'])
on conflict (id) do update set
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "objects select asset files" on storage.objects;
create policy "objects select asset files"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'asset-files' and public.spray_wash_has_role(array['Admin','Maintenance manager','Vehicle inspector']));

drop policy if exists "objects insert asset files" on storage.objects;
create policy "objects insert asset files"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'asset-files' and public.spray_wash_has_role(array['Admin','Maintenance manager']));

drop policy if exists "objects delete asset files" on storage.objects;
create policy "objects delete asset files"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'asset-files' and public.spray_wash_has_role(array['Admin','Maintenance manager']));
