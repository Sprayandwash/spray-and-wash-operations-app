# Production notification scheduler — audit record (7 September 2026)

**Type:** Read-only verification. No application code, migration, or database write occurred.
**Method:** Direct read-only SQL query against isolated Staging and Production via the Supabase SQL Editor, cross-checked against the Production Admin → Settings → Notifications screen.

## Finding: two undocumented Production cron jobs

Two Production cron jobs run every 15 minutes and are not created by any migration or GitHub Actions workflow committed to this repository:

| jobid | jobname | schedule | active |
| --- | --- | --- | --- |
| 2 | `spray-and-wash-task-push-production` | `*/15 * * * *` | true |
| 3 | `spray-and-wash-weekly-notifications-production` | `*/15 * * * *` | true |

The equivalent Staging jobs (`spray-and-wash-routine-task-push-staging`, `spray-and-wash-weekly-routine-staging`) are also `active: true`, despite both being created with `active := false` by `configure-inactive-staging-routine-task-push-scheduler.yml` and `configure-inactive-staging-weekly-routine-scheduler.yml`. No commit in this repository sets either Staging job back to active.

## Delivery status: confirmed inert

On Production, `public.operations_notification_settings` (id = 1) read: `notifications_enabled = false`, `task_push_enabled = false`, `admin_weekly_email_enabled = false`, `employee_weekly_email_allowed = false`. The most recent recorded run at the time of this audit: `last_scheduler_run_at = 2026-09-07 05:15:02+00`, `last_scheduler_status = backend_disabled`. The Production Admin → Settings → Notifications screen independently confirmed the same state: Master OFF, Push backend disabled, Weekly email backend disabled, 0 push-enabled users, 0 granted devices.

Staging's settings row is likewise fully disabled.

## Conclusion

The scheduler infrastructure is live in both environments and executing on its 15-minute schedule, but the Admin settings gate and the independent backend kill-switch (`TASK_PUSH_DELIVERY_ENABLED`, `WEEKLY_ROUTINE_DELIVERY_ENABLED`) both hold delivery inert. This matches the intended plan: no routine notification is sent until employees have the app installed, are signed in, and have enrolled for push. No push, email, or database write occurred during this audit.

## Gap identified

Unlike every other Production-affecting change in this project, the two Production cron jobs above have no committed migration, workflow, or pull request recording who created them or when, and the Staging jobs' live `active` state does not match what the only committed workflow touching them ever sets. This gap should be closed — for example by recording the job definitions in a documentation note tied to any future scheduler-related change — before further scheduler work proceeds, so a future session is not left to reverse-engineer live database state to understand what is actually running.
