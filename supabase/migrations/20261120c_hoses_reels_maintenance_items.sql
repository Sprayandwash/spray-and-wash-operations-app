-- Standard "as required" maintenance items for the Hoses & Reels sub-asset (no interval, so no tasks are generated automatically).
insert into public.operations_maintenance_procedures (name, category, target_type, description, frequency_days, skill_level, requires_signoff, is_active)
select v.name, 'Hoses & Reels', 'washing_equipment', v.description, null, 'Basic', false, true
from (values
  ('PM - Hoses & Reels - Service unloader valve', 'Service unloader valve'),
  ('PM - Hoses & Reels - Service swivel', 'Service swivel'),
  ('PM - Hoses & Reels - Replace hose', 'Replace hose')
) as v(name, description)
where not exists (select 1 from public.operations_maintenance_procedures p where p.name = v.name);
