-- Deadline reminders: an outbox, not a sender.
--
-- The product needs "a deadline is approaching" to leave the building. It must
-- not invent a deadline to do it: the due date on a case already comes from a
-- verified rule (lib/rules.ts -> compliance_cases.due_on). This migration adds
-- only the queue, one deduplicated row per case and due date, so a nightly run
-- cannot send the same reminder twice.
--
-- No provider is wired here. Sending is a separate change (and a separate
-- consent conversation for SMS/WhatsApp); this table is what a sender drains.

create table public.notification_outbox (
  id             uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  taxpayer_id    uuid references public.taxpayers(id) on delete cascade,
  recipient_kind text not null check (recipient_kind in ('firm_member', 'taxpayer_contact')),
  recipient_ref  uuid,
  channel        text not null check (channel in ('email', 'sms', 'whatsapp')),
  template       text not null,
  payload        jsonb not null default '{}'::jsonb,
  dedupe_key     text not null unique,
  due_at         timestamptz not null default now(),
  sent_at        timestamptz,
  attempt_count  integer not null default 0 check (attempt_count >= 0),
  last_error     text,
  created_at     timestamptz not null default now()
);

comment on table public.notification_outbox is
  'Queue of outbound reminders. A row is enqueued once per real event (dedupe_key), then drained by a sender. Contains no message body and no address: the sender resolves both at send time, so a leaked row cannot mail anyone.';

create index notification_outbox_pending_idx
  on public.notification_outbox (due_at) where sent_at is null;
create index notification_outbox_org_idx
  on public.notification_outbox (organization_id, created_at desc);

alter table public.notification_outbox enable row level security;

-- A firm may see what was queued for its own clients. It may not enqueue or
-- rewrite: the queue is written by the service role only, from a function that
-- derives every field from rows the caller does not supply.
create policy "firm reads its own reminders" on public.notification_outbox
  for select to authenticated
  using (organization_id = private.current_member_org());

revoke all on public.notification_outbox from anon, authenticated;
grant select on public.notification_outbox to authenticated;

-- Enqueue approaching deadlines. Idempotent: re-running changes nothing.
create or replace function private.enqueue_due_reminders(p_horizon_days integer default 3)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  inserted integer;
begin
  if p_horizon_days < 0 or p_horizon_days > 60 then
    raise exception 'horizon must be between 0 and 60 days';
  end if;

  with due as (
    select c.id, c.organization_id, c.taxpayer_id, c.due_on, c.obligation_code, c.period_token
      from public.compliance_cases c
     where c.due_on is not null
       and c.due_on between current_date and current_date + p_horizon_days
       and c.stage not in ('abandoned', 'cancelled')
       and c.filing_status <> 'verified'
  ), ins as (
    insert into public.notification_outbox
      (organization_id, taxpayer_id, recipient_kind, channel, template, payload, dedupe_key, due_at)
    select d.organization_id,
           d.taxpayer_id,
           'firm_member',
           'email',
           'deadline_approaching',
           jsonb_build_object(
             'case_id', d.id,
             'obligation', d.obligation_code,
             'period', d.period_token,
             'due_on', d.due_on
           ),
           'deadline:' || d.id::text || ':' || d.due_on::text,
           (d.due_on::timestamptz - interval '2 days')
      from due d
    on conflict (dedupe_key) do nothing
    returning 1
  )
  select count(*) into inserted from ins;

  return inserted;
end;
$$;

comment on function private.enqueue_due_reminders(integer) is
  'Queues one reminder per approaching case deadline, deduplicated by case and due date. Service role only; no provider is contacted.';

revoke all on function private.enqueue_due_reminders(integer) from public, anon, authenticated;
grant execute on function private.enqueue_due_reminders(integer) to service_role;
