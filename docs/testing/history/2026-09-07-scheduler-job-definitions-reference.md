# Notification scheduler job definitions — reference (7 September 2026)

**Type:** Documentation only. Captures the exact live `cron.job` definitions found in Staging and Production by direct read-only query on 7 September 2026. No job was created, altered, or removed to produce this record.

This closes the gap identified in the [production scheduler audit](2026-09-07-production-scheduler-audit.md): the four live jobs below have no committed migration or workflow that creates them. This file is the committed source of truth for what "correct" looks like. It is intentionally not applied by any workflow, because recreating a live pg_cron job from a guess risks silently overwriting a working schedule. A future task can compare live state against this reference (see the paired verify workflows below) or use it as the basis for a deliberately reviewed migration under Step 10B.

## Production (`twkgfmctuffmkvkmdkct`)

### `spray-and-wash-task-push-production`

- jobid: 2
- schedule: `*/15 * * * *`
- active: true

```sql
select net.http_post(
    url := 'https://twkgfmctuffmkvkmdkct.supabase.co/functions/v1/notification-scheduler',
    headers := jsonb_build_object('Content-Type','application/json','x-spray-wash-task-push-secret',(select decrypted_secret from vault.decrypted_secrets where name='task_push_scheduler_secret')),
    body := jsonb_build_object('action','run_task_push_delivery')
  );
```

### `spray-and-wash-weekly-notifications-production`

- jobid: 3
- schedule: `*/15 * * * *`
- active: true

```sql
select net.http_post(
    url := 'https://twkgfmctuffmkvkmdkct.supabase.co/functions/v1/notification-scheduler',
    headers := jsonb_build_object('Content-Type','application/json','x-spray-wash-scheduler-secret',(select decrypted_secret from vault.decrypted_secrets where name='weekly_routine_scheduler_secret')),
    body := jsonb_build_object('action','run_weekly_routine_delivery')
  );
```

## Staging (`tsnmbvezrweciaitkquf`)

### `spray-and-wash-routine-task-push-staging`

- jobid: 8
- schedule: `*/15 * * * *`
- active: true

```sql
select net.http_post(
    url := 'https://tsnmbvezrweciaitkquf.supabase.co/functions/v1/notification-scheduler',
    headers := jsonb_build_object('Content-Type','application/json','x-spray-wash-task-push-secret',(select decrypted_secret from vault.decrypted_secrets where name='task_push_scheduler_secret')),
    body := jsonb_build_object('action','run_task_push_delivery')
  );
```

### `spray-and-wash-weekly-routine-staging`

- jobid: 1
- schedule: `*/15 * * * *`
- active: true

```sql
select net.http_post(
    url := 'https://tsnmbvezrweciaitkquf.supabase.co/functions/v1/notification-scheduler',
    headers := jsonb_build_object('Content-Type','application/json','x-spray-wash-scheduler-secret',(select decrypted_secret from vault.decrypted_secrets where name='weekly_routine_scheduler_secret')),
    body := jsonb_build_object('action','run_weekly_routine_delivery')
  );
```

## Note on Staging `active: true`

Both Staging jobs above are recorded live as `active: true`, even though the only committed workflow that ever created them (`configure-inactive-staging-routine-task-push-scheduler.yml`, `configure-inactive-staging-weekly-routine-scheduler.yml`) sets `active := false` immediately after creation, and both point at the current `notification-scheduler` function rather than the older `employee-notifications` function those workflows deploy. Something outside this repository's committed history re-pointed and reactivated them. Delivery remains independently gated off (see the audit record), so this is a documentation gap, not a live safety issue.

## Verification

Two read-only workflows compare live state against this file on demand: `verify-staging-scheduler-definitions.yml` and `verify-production-scheduler-definitions.yml`. Neither workflow can create, alter, or delete a job — each runs a single read-only `select` against `cron.job` and fails if the result no longer matches what is recorded above.

