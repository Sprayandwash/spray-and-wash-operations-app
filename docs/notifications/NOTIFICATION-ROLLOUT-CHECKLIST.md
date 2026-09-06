# Notification rollout checklist

## Current readiness

The technical push and weekly-email paths have been verified in isolated Staging. The recurring scheduler routes are now permanently installed and run every 15 minutes in Staging and Production, but provider delivery remains disabled by the independent backend emergency flags and the Admin master setting defaults to OFF.

The permanent operational controls live in **Admin → Settings → Notifications**. Administrators can set the master state, assignment delay, due-soon lead time and send time, overdue send time and cadence, allowed push days/hours, Admin weekly-email schedule, and employee weekly-email allowance/schedule.

## Employee device enrolment

Production enrolment is the normal path so employees do not need to enrol twice. For each employee who will receive reminders:

1. Open the installed Production PWA shortcut on their Android phone.
2. Sign in with that employee's own account.
3. Open **Account** and select **Enable phone reminders**.
4. Accept the Android/Chrome notification permission.
5. Confirm Admin → Settings → Notifications shows the expected enrolled-device/user count.

Acceptance criterion: every intended recipient has one current subscription with permission `granted` and no recent failure.

## Weekly email preference

- Admin weekly summary is controlled globally in Admin → Settings → Notifications.
- Employee weekly summaries remain individually opt-in and must include only that employee's tasks.
- The Admin setting **Allow employee opt-in** is an additional global gate.
- No employee weekly email is sent when that employee has no open tasks.

## Scheduler and safety gates

- `notification-scheduler` wakes every 15 minutes and reads `operations_notification_settings`.
- Scheduler authentication is checked against Vault through the service-role-only `verify_notification_scheduler_secret` function.
- Push provider delivery additionally requires `TASK_PUSH_DELIVERY_ENABLED=true`.
- Weekly email provider delivery additionally requires `WEEKLY_ROUTINE_DELIVERY_ENABLED=true`.
- Therefore an Admin setting alone cannot bypass the emergency backend kill switch.
- With either backend gate disabled, the scheduler returns `backend_disabled` and creates no delivery.

## Step 9B gate

Before the next external-send Step 9B, report:

1. exact intended recipient(s) and enrolled-device count;
2. channel (push or email);
3. applicable Pacific/Auckland timing/window;
4. notification candidate/source being used for the controlled test;
5. backend and Admin settings that will be enabled for the test; and
6. the rollback sequence that returns provider delivery to disabled.

No external-send test is performed without explicit Step 9B approval.

## Production activation gate

Do not enable routine provider delivery until intended Production staff devices are enrolled, the controlled Step 9B test is successful, and the user explicitly approves the production recipients/timing/rollback.

## Rollback

For push, disable `TASK_PUSH_DELIVERY_ENABLED`; for weekly email, disable `WEEKLY_ROUTINE_DELIVERY_ENABLED`. The Admin master can also be switched OFF immediately. Leave the scheduler jobs installed, because disabled scheduler runs are intentionally inert. Preserve notification/delivery ledgers for diagnosis and document the fault before any further external-send test.
