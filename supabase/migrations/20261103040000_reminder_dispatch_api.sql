-- Reminder dispatch over PostgREST.
--
-- The claim/confirm protocol lives in private, which PostgREST does not
-- publish, so a worker cannot call it. These two wrappers are the only public
-- surface, and they are service-role only: anon and authenticated are refused,
-- which keeps the outbox out of the reach of any browser key.

create or replace function public.dispatch_reminders(p_limit integer default 25)
returns setof public.notification_outbox
language sql
security definer
set search_path = public, pg_temp
as $$
  select * from private.claim_reminders(p_limit);
$$;

create or replace function public.complete_reminder(p_id uuid, p_sent boolean, p_error text default null)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_sent then
    perform private.mark_reminder_sent(p_id);
  else
    perform private.mark_reminder_failed(p_id, coalesce(p_error, 'unspecified'));
  end if;
end;
$$;

comment on function public.dispatch_reminders(integer) is
  'Service-role only: claims due reminders for one worker. Never callable from a browser key.';
comment on function public.complete_reminder(uuid, boolean, text) is
  'Service-role only: marks a claimed reminder sent or failed.';

revoke all on function public.dispatch_reminders(integer) from public, anon, authenticated;
revoke all on function public.complete_reminder(uuid, boolean, text) from public, anon, authenticated;
grant execute on function public.dispatch_reminders(integer) to service_role;
grant execute on function public.complete_reminder(uuid, boolean, text) to service_role;
