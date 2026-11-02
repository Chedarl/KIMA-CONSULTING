-- Reminder delivery: claim, then confirm.
--
-- The outbox queues; nothing drains it yet. This adds the smallest safe
-- protocol: a worker claims a batch (which increments the attempt count and
-- holds a lease), then marks each row sent or failed. A row is retried at most
-- five times and a stale lease expires after ten minutes, so a crashed worker
-- cannot silently swallow a reminder.

alter table public.notification_outbox
  add column claimed_at timestamptz;

create index notification_outbox_claimable_idx
  on public.notification_outbox (due_at)
  where sent_at is null;

create or replace function private.claim_reminders(p_limit integer default 25)
returns setof public.notification_outbox
language sql
security definer
set search_path = public, pg_temp
as $$
  update public.notification_outbox o
     set claimed_at = now(),
         attempt_count = o.attempt_count + 1
   where o.id in (
     select id
       from public.notification_outbox
      where sent_at is null
        and due_at <= now()
        and attempt_count < 5
        and (claimed_at is null or claimed_at < now() - interval '10 minutes')
      order by due_at
      limit greatest(p_limit, 0)
      for update skip locked
   )
  returning o.*;
$$;

create or replace function private.mark_reminder_sent(p_id uuid)
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  update public.notification_outbox
     set sent_at = now(), claimed_at = null, last_error = null
   where id = p_id and sent_at is null;
$$;

create or replace function private.mark_reminder_failed(p_id uuid, p_error text)
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  update public.notification_outbox
     set claimed_at = null, last_error = left(p_error, 500)
   where id = p_id and sent_at is null;
$$;

comment on function private.claim_reminders(integer) is
  'Claims up to p_limit due reminders for one worker. Not idempotent by design: each call takes a ten-minute lease and increments attempt_count, so a caller that crashes mid-send releases the row when the lease expires.';

revoke all on function private.claim_reminders(integer) from public, anon, authenticated;
revoke all on function private.mark_reminder_sent(uuid) from public, anon, authenticated;
revoke all on function private.mark_reminder_failed(uuid, text) from public, anon, authenticated;
grant execute on function private.claim_reminders(integer) to service_role;
grant execute on function private.mark_reminder_sent(uuid) to service_role;
grant execute on function private.mark_reminder_failed(uuid, text) to service_role;
