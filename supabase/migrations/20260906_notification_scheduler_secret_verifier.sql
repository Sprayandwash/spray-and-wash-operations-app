-- Verify scheduler headers against Vault without exposing secret values to browser code or repository files.
create or replace function public.verify_notification_scheduler_secret(secret_kind text, supplied_secret text)
returns boolean
language sql
security definer
set search_path = public, vault, pg_temp
as $$
  select case secret_kind
    when 'push' then exists (
      select 1 from vault.decrypted_secrets
      where name = 'task_push_scheduler_secret'
        and decrypted_secret = supplied_secret
    )
    when 'weekly' then exists (
      select 1 from vault.decrypted_secrets
      where name = 'weekly_routine_scheduler_secret'
        and decrypted_secret = supplied_secret
    )
    else false
  end;
$$;

revoke all on function public.verify_notification_scheduler_secret(text,text) from public, anon, authenticated;
grant execute on function public.verify_notification_scheduler_secret(text,text) to service_role;
