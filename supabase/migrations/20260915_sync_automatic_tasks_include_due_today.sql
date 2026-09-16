-- Maintenance module bug-fix batch (15 Sep 2026)
--
-- operations_sync_automatic_tasks_v4077() only auto-created a maintenance
-- task once a schedule's next_due_at was strictly in the past (< current_date),
-- so an item due today never got its task created automatically until the day
-- after. Widen the maintenance half of the sync to <= current_date so "due
-- today" is treated the same as "overdue", matching the documented behaviour
-- (tasks generate automatically once a schedule becomes due/overdue).
--
-- The Height inspection half of the function is untouched.

CREATE OR REPLACE FUNCTION public.operations_sync_automatic_tasks_v4077()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  maintenance_count integer := 0;
  height_count integer := 0;
BEGIN
  -- Cron and trusted server contexts have no auth.uid(). Authenticated callers
  -- must hold one of the roles that owns automatic task generation.
  IF auth.uid() IS NOT NULL
     AND NOT public.spray_wash_has_role(ARRAY['Admin','Maintenance manager','Height equipment manager']) THEN
    RAISE EXCEPTION 'This role cannot synchronise automatic tasks.';
  END IF;

  INSERT INTO public.operations_maintenance_tasks (
    source_type, source_module, source_record_type, source_record_id,
    target_type, target_record_id, target_label, vehicle_id,
    washing_equipment_id, procedure_id, schedule_id, title,
    description, status, priority, due_date, assigned_role,
    automatic_key, created_by
  )
  SELECT
    'Scheduled', 'maintenance', 'maintenance_schedule', schedule.id,
    CASE WHEN schedule.washing_equipment_id IS NOT NULL THEN 'washing_equipment' ELSE 'vehicle' END,
    coalesce(schedule.washing_equipment_id, schedule.vehicle_id),
    coalesce(machinery.asset_identifier, vehicle.rego, 'Maintenance asset'),
    coalesce(machinery.assigned_vehicle_id, schedule.vehicle_id),
    schedule.washing_equipment_id, schedule.procedure_id, schedule.id,
    trim(CASE
      WHEN procedure.category ILIKE 'Planned:%' THEN regexp_replace(procedure.category, '^Planned:\s*', '')
      WHEN procedure.name LIKE 'PM - %' THEN regexp_replace(procedure.name, '^PM - [^-]+ -\s*', '')
      ELSE coalesce(procedure.description, procedure.name, 'Scheduled maintenance')
    END) || ' - ' || coalesce(machinery.asset_identifier, vehicle.rego, 'Asset'),
    coalesce(procedure.description, 'Scheduled maintenance is due.'),
    'Open', 'Medium', schedule.next_due_at::date, 'Maintenance manager',
    'maintenance_schedule:' || schedule.id::text || ':' || schedule.next_due_at::date::text,
    NULL
  FROM public.operations_equipment_maintenance_schedules schedule
  LEFT JOIN public.operations_maintenance_procedures procedure ON procedure.id = schedule.procedure_id
  LEFT JOIN public.operations_washing_equipment machinery ON machinery.id = schedule.washing_equipment_id
  LEFT JOIN public.operations_vehicles vehicle ON vehicle.id = schedule.vehicle_id
  WHERE coalesce(schedule.is_active, true)
    AND schedule.next_due_at IS NOT NULL
    AND schedule.next_due_at::date <= current_date
  ON CONFLICT (automatic_key) WHERE automatic_key IS NOT NULL DO NOTHING;

  GET DIAGNOSTICS maintenance_count = ROW_COUNT;

  -- Only the latest effective Height inspection for an item may generate an open
  -- failure task. This prevents historical failures from being recreated after a pass.
  WITH ranked_height AS (
    SELECT i.*,
      row_number() OVER (
        PARTITION BY i.equipment_id
        ORDER BY i.inspection_date DESC, i.created_at DESC NULLS LAST, i.id DESC
      ) AS effective_rank
    FROM public.inspections i
    WHERE i.equipment_id IS NOT NULL
  )
  INSERT INTO public.operations_maintenance_tasks (
    source_type, source_module, source_record_type, source_record_id,
    target_type, target_record_id, target_label, title, description,
    status, priority, due_date, assigned_role, automatic_key, created_by
  )
  SELECT
    'Inspection', 'height_equipment', 'height_inspection', inspection.id,
    'height_equipment', inspection.equipment_id, inspection.serial,
    'Height inspection failed - ' || inspection.serial,
    trim(coalesce(inspection.result, 'Failed inspection') ||
      CASE WHEN nullif(btrim(inspection.notes), '') IS NOT NULL
        THEN E'\n' || btrim(inspection.notes) ELSE '' END),
    'Open', 'Critical', coalesce(inspection.inspection_date, current_date),
    'Height equipment manager', 'height_inspection:' || inspection.id::text, NULL
  FROM ranked_height inspection
  WHERE inspection.effective_rank = 1
    AND inspection.result IN ('Fail - Repair Required','Fail - Remove From Service / Disposal')
  ON CONFLICT (automatic_key) WHERE automatic_key IS NOT NULL DO NOTHING;

  GET DIAGNOSTICS height_count = ROW_COUNT;

  RETURN jsonb_build_object(
    'maintenance_tasks_created', maintenance_count,
    'height_tasks_created', height_count
  );
END;
$function$
