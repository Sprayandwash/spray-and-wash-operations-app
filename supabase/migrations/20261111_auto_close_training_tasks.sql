-- Close automatic training tasks when the person is no longer due.
-- Until now operations_sync_automatic_tasks_v4077 only created training tasks, so a task stayed Open
-- after the training record was renewed or added. This adds:
--   1. operations_close_stale_training_tasks_v4078(): closes stale training tasks and returns how many.
--   2. A trigger on operations_training_records so the task closes the moment a record is added or changed.
-- Closed tasks are set to Completed with a note explaining why. No data is deleted.

create or replace function public.operations_close_stale_training_tasks_v4078()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  closed_count integer := 0;
begin
  with latest as (
    select r.id, r.person_id, r.course_id, r.expiry_date,
           row_number() over (
             partition by r.person_id, r.course_id
             order by r.completed_date desc nulls last, r.created_at desc nulls last, r.id desc) as effective_rank
    from public.operations_training_records r
  ),
  stale as (
    select t.id,
      case
        when t.automatic_key like 'training_record_expiry:%' then
          case
            when rec.id is null then 'the training record no longer exists'
            when rec.effective_rank > 1 then 'a newer training record has been added'
            when rec.expiry_date is null or rec.expiry_date > current_date + interval '30 days' then 'the training record is now current'
            when coalesce(person.active, true) = false then 'the person is no longer active'
            when coalesce(course.active, true) = false then 'the course is no longer active'
            when coalesce(matrix.applicable, true) = false then 'the course no longer applies to this person'
          end
        when t.automatic_key like 'training_matrix_missing:%' then
          case
            when exists (select 1 from public.operations_training_records r2
                         where r2.person_id = t.target_record_id
                           and r2.course_id::text = split_part(t.automatic_key, ':', 3)) then 'a training record has been added'
            when mx.id is null or not (mx.applicable and mx.compulsory) then 'the course is no longer compulsory for this person'
            when coalesce(person.active, true) = false then 'the person is no longer active'
            when coalesce(course.active, true) = false then 'the course is no longer active'
          end
      end as reason
    from public.operations_maintenance_tasks t
    left join latest rec on t.automatic_key like 'training_record_expiry:%' and rec.id::text = split_part(t.automatic_key, ':', 2)
    left join public.operations_training_matrix matrix on t.automatic_key like 'training_record_expiry:%' and matrix.person_id = rec.person_id and matrix.course_id = rec.course_id
    left join public.operations_training_matrix mx on t.automatic_key like 'training_matrix_missing:%' and mx.person_id::text = split_part(t.automatic_key, ':', 2) and mx.course_id::text = split_part(t.automatic_key, ':', 3)
    left join public.operations_training_people person on person.id = coalesce(rec.person_id, mx.person_id)
    left join public.operations_training_courses course on course.id = coalesce(rec.course_id, mx.course_id)
    where t.source_module = 'training'
      and t.status in ('Open', 'In Progress', 'Waiting on Parts', 'Waiting on Someone')
      and (t.automatic_key like 'training_record_expiry:%' or t.automatic_key like 'training_matrix_missing:%')
  )
  update public.operations_maintenance_tasks t
     set status = 'Completed',
         completed_at = now(),
         completion_notes = coalesce(nullif(btrim(t.completion_notes), ''), 'Closed automatically: ' || s.reason || '.')
    from stale s
   where t.id = s.id and s.reason is not null;

  get diagnostics closed_count = row_count;
  return closed_count;
end;
$$;

revoke all on function public.operations_close_stale_training_tasks_v4078() from public, anon, authenticated;
grant execute on function public.operations_close_stale_training_tasks_v4078() to service_role;

create or replace function public.operations_training_record_close_tasks_v4078()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.operations_close_stale_training_tasks_v4078();
  return null;
end;
$$;

revoke all on function public.operations_training_record_close_tasks_v4078() from public, anon, authenticated;

drop trigger if exists operations_training_record_close_tasks_v4078 on public.operations_training_records;
create trigger operations_training_record_close_tasks_v4078
  after insert or update or delete on public.operations_training_records
  for each statement execute function public.operations_training_record_close_tasks_v4078();

-- Also react when a requirement, person or course is switched off or changed.
drop trigger if exists operations_training_matrix_close_tasks_v4078 on public.operations_training_matrix;
create trigger operations_training_matrix_close_tasks_v4078
  after insert or update or delete on public.operations_training_matrix
  for each statement execute function public.operations_training_record_close_tasks_v4078();

drop trigger if exists operations_training_people_close_tasks_v4078 on public.operations_training_people;
create trigger operations_training_people_close_tasks_v4078
  after update on public.operations_training_people
  for each statement execute function public.operations_training_record_close_tasks_v4078();

drop trigger if exists operations_training_courses_close_tasks_v4078 on public.operations_training_courses;
create trigger operations_training_courses_close_tasks_v4078
  after update on public.operations_training_courses
  for each statement execute function public.operations_training_record_close_tasks_v4078();

-- One-time catch-up: close tasks that are already stale.
select public.operations_close_stale_training_tasks_v4078();
