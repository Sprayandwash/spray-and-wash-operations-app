-- Extra detail fields for the "Hoses & Reels" sub-asset (machinery). New nullable columns only; no data is changed.
alter table public.operations_washing_equipment add column if not exists unloader_make_model text;
alter table public.operations_washing_equipment add column if not exists swivel_make_model text;
alter table public.operations_washing_equipment add column if not exists swivel_seal_kit_part_number text;
