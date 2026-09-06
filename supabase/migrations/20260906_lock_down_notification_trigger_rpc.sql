-- The assignment queue function is a trigger implementation, not a public RPC.
revoke execute on function public.queue_operations_task_assignment_push() from public, anon, authenticated;
