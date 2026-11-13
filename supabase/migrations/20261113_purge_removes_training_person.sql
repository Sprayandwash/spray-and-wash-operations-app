-- Purge a TEST account and everything it authored, in one transaction.
-- 13 Nov 2026: also removes the account's Training person, with their records, evidence file rows and matrix rows.
-- The evidence file paths are returned (evidence_paths) so the account-admin function can delete the stored files.
-- Only the account-admin edge function (service role) may call this; the edge function enforces the safety gates
-- (Admin caller, not self, target Blocked, not an Admin, typed email and PURGE). This function repeats the data-level gates.
create or replace function public.purge_test_account(target uuid, caller uuid, dry_run boolean default true)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
  v_counts jsonb;
  v_total integer;
  c_tpeople integer; c_trecords integer; c_tfiles integer; v_paths jsonb;
  c_tasks integer; c_insp integer; c_readings integer; c_steps integer; c_certs integer; c_audit integer; c_files integer; c_photos integer;
  max_rows constant integer := 300;
begin
  if target is null or caller is null then raise exception 'Missing account.'; end if;
  if target = caller then raise exception 'You cannot purge your own account.'; end if;
  select email into v_email from public.profiles where user_id = target;
  if v_email is null then raise exception 'Account not found.'; end if;
  if exists (select 1 from public.user_roles where user_id = target and role = 'Admin') then
    raise exception 'Admin accounts cannot be purged. Remove the Admin role first.';
  end if;
  if not exists (select 1 from public.app_user_access where user_id = target and status = 'Blocked') then
    raise exception 'Block the account before purging it.';
  end if;

  select count(*) into c_certs from public.certificates where generated_by = target;
  if c_certs > 0 then raise exception 'This account generated % certificate(s). Certificates are compliance records and are never purged.', c_certs; end if;

  select count(*) into c_tasks from public.operations_maintenance_tasks where created_by = target or completed_by = target;
  select count(*) into c_insp from public.operations_inspections where submitted_by = target;
  select count(*) into c_readings from public.operations_maintenance_readings where recorded_by = target;
  select count(*) into c_steps from public.operations_maintenance_task_steps where completed_by = target;
  select count(*) into c_photos from public.operations_inspection_photos where uploaded_by = target;
  select count(*) into c_files from public.operations_asset_files where uploaded_by = target;
  select count(*) into c_audit from public.audit_logs where actor_user_id = target;
  select count(*) into c_tpeople from public.operations_training_people where user_id = target;
  select count(*) into c_trecords from public.operations_training_records r join public.operations_training_people p on p.id = r.person_id where p.user_id = target;
  select count(*), coalesce(jsonb_agg(f.storage_path), '[]'::jsonb) into c_tfiles, v_paths from public.operations_training_record_files f join public.operations_training_records r on r.id = f.record_id join public.operations_training_people p on p.id = r.person_id where p.user_id = target;

  v_total := c_tasks + c_insp + c_readings + c_steps + c_photos + c_files + c_audit + c_trecords + c_tfiles;
  v_counts := jsonb_build_object(
    'email', v_email,
    'maintenance_tasks', c_tasks, 'inspections', c_insp, 'maintenance_readings', c_readings,
    'task_steps_completed', c_steps, 'inspection_photos', c_photos, 'asset_files_uploaded', c_files,
    'audit_log_rows', c_audit, 'training_people', c_tpeople, 'training_records', c_trecords, 'training_files', c_tfiles, 'total', v_total, 'limit', max_rows);
  if v_total > max_rows then
    raise exception 'This account has % records, more than the % limit for a test account. Block it instead.', v_total, max_rows;
  end if;
  if dry_run then return v_counts || jsonb_build_object('dry_run', true); end if;

  delete from public.operations_maintenance_tasks where created_by = target or completed_by = target;
  delete from public.operations_inspections where submitted_by = target;
  delete from public.operations_maintenance_readings where recorded_by = target;
  delete from public.audit_logs where actor_user_id = target;
  -- Training person: records, evidence file rows and matrix rows go with it (ON DELETE CASCADE).
  delete from public.operations_training_people where user_id = target;
  -- Rows other people own that merely mention this account: keep them, clear the link so the user can be removed.
  update public.operations_maintenance_task_steps set completed_by = null where completed_by = target;
  update public.operations_inspection_photos set uploaded_by = null where uploaded_by = target;
  update public.operations_asset_files set uploaded_by = null where uploaded_by = target;
  update public.operations_contractors set created_by = null where created_by = target;
  update public.operations_notification_preferences set updated_by = null where updated_by = target;
  update public.operations_notification_settings set updated_by = null where updated_by = target;
  update public.operations_training_courses set created_by = null where created_by = target;
  update public.operations_training_matrix set set_by = null where set_by = target;
  update public.operations_training_people set created_by = null where created_by = target;
  update public.operations_training_record_files set uploaded_by = null where uploaded_by = target;
  update public.operations_training_records set verified_by = null where verified_by = target;
  update public.operations_training_sessions set created_by = null where created_by = target;
  update public.user_roles set assigned_by = null where assigned_by = target;
  update public.app_user_access set updated_by = null where updated_by = target;

  insert into public.audit_logs(actor_user_id, action, entity_type, summary, details)
  values (caller, 'purge_test_account', 'account', 'Purged test account ' || v_email, v_counts);
  return v_counts || jsonb_build_object('dry_run', false, 'evidence_paths', v_paths);
end;
$$;
revoke all on function public.purge_test_account(uuid, uuid, boolean) from public, anon, authenticated;
grant execute on function public.purge_test_account(uuid, uuid, boolean) to service_role;
