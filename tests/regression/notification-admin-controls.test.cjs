const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('NOTIFY-ADMIN-001: Admin settings expose independent notification timing controls', () => {
  const client = read('push-notifications.js');
  for (const token of [
    'Automatic notifications',
    'Task push notifications',
    'Assignment delay (minutes)',
    'How long before due (hours)',
    'Due-soon send time',
    'Overdue send time',
    'Repeat every (days)',
    'Push delivery window',
    'Admin weekly email',
    'Allow employee opt-in'
  ]) assert.match(client, new RegExp(token.replace(/[()]/g, '\\$&')));
  assert.match(client, /push_days/);
  assert.match(client, /admin_weekly_time/);
  assert.match(client, /employee_weekly_time/);
  assert.match(client, /Pacific\/Auckland/);
});

test('NOTIFY-ADMIN-002: scheduler delivery still requires independent backend kill switches', () => {
  const push = read('supabase/functions/notification-scheduler/push.ts');
  const weekly = read('supabase/functions/notification-scheduler/weekly.ts');
  assert.match(push, /TASK_PUSH_DELIVERY_ENABLED/);
  assert.match(push, /notifications_enabled/);
  assert.match(push, /task_push_enabled/);
  assert.match(weekly, /WEEKLY_ROUTINE_DELIVERY_ENABLED/);
  assert.match(weekly, /notifications_enabled/);
});

test('NOTIFY-ADMIN-003: scheduler authentication is Vault-backed and service-role-only', () => {
  const verifier = read('supabase/migrations/20260906_notification_scheduler_secret_verifier.sql');
  const scheduler = read('supabase/functions/notification-scheduler/common.ts');
  assert.match(verifier, /vault\.decrypted_secrets/);
  assert.match(verifier, /revoke all .* from public, anon, authenticated/i);
  assert.match(verifier, /grant execute .* to service_role/i);
  assert.match(scheduler, /verify_notification_scheduler_secret/);
  assert.doesNotMatch(scheduler, /TASK_PUSH_SCHEDULER_SECRET|WEEKLY_ROUTINE_SCHEDULER_SECRET/);
});

test('NOTIFY-ADMIN-004: notification settings default to provider delivery off', () => {
  const migration = read('supabase/migrations/20260906_notification_admin_controls.sql');
  assert.match(migration, /notifications_enabled boolean not null default false/);
  assert.match(migration, /task_push_enabled boolean not null default false/);
  assert.match(migration, /admin_weekly_email_enabled boolean not null default false/);
  assert.match(migration, /employee_weekly_email_allowed boolean not null default false/);
});
