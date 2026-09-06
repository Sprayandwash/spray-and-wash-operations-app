-- Admin-controlled notification policy. Delivery remains separately gated by backend environment flags.
create table if not exists public.operations_notification_settings (
  id smallint primary key default 1 check (id = 1),
  notifications_enabled boolean not null default false,
  task_push_enabled boolean not null default false,
  assignment_push_enabled boolean not null default true,
  assignment_delay_minutes integer not null default 0 check (assignment_delay_minutes between 0 and 1440),
  due_soon_enabled boolean not null default true,
  due_soon_hours_before integer not null default 48 check (due_soon_hours_before between 1 and 720),
  due_soon_send_time time without time zone not null default '08:00',
  overdue_enabled boolean not null default true,
  overdue_send_time time without time zone not null default '08:00',
  overdue_repeat_days integer not null default 1 check (overdue_repeat_days between 1 and 30),
  push_start_time time without time zone not null default '06:30',
  push_end_time time without time zone not null default '19:00',
  push_days smallint[] not null default array[1,2,3,4,5]::smallint[],
  admin_weekly_email_enabled boolean not null default false,
  admin_weekly_day smallint not null default 1 check (admin_weekly_day between 1 and 7),
  admin_weekly_time time without time zone not null default '07:30',
  employee_weekly_email_allowed boolean not null default false,
  employee_weekly_day smallint not null default 1 check (employee_weekly_day between 1 and 7),
  employee_weekly_time time without time zone not null default '07:30',
  timezone text not null default 'Pacific/Auckland' check (timezone = 'Pacific/Auckland'),
  last_scheduler_run_at timestamptz,
  last_scheduler_status text,
  last_scheduler_detail jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);

insert into public.operations_notification_settings (id) values (1) on conflict (id) do nothing;
alter table public.operations_notification_settings enable row level security;
revoke all on public.operations_notification_settings from anon, authenticated;

comment on table public.operations_notification_settings is 'Admin-controlled notification policy; backend delivery flags remain an independent emergency kill switch.';
comment on column public.operations_notification_settings.push_days is 'ISO weekdays: Monday=1 through Sunday=7.';
