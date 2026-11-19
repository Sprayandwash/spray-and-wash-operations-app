-- Allow the "Hoses & Reels" sub-asset (machinery) type. Only widens an existing check; no data is changed.
alter table public.operations_washing_equipment drop constraint if exists operations_machinery_type_check;
alter table public.operations_washing_equipment add constraint operations_machinery_type_check
  check (machinery_type is null or machinery_type = any (array['Engine','Gearbox','Pump','Hoses & Reels']));
