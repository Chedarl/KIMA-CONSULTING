-- ---------------------------------------------------------------------------
-- Foundation wave: a durable domain event for every meaningful change.
--
-- The Rebuild brief: the transaction updates the business record and its event
-- record together, so the system never has to infer later whether something
-- happened. Firm and client views will read these same events under different
-- RLS lenses; the activity feed and KIMA Copilot both observe this table.
-- ---------------------------------------------------------------------------

create table public.domain_events (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,
  occurred_at     timestamptz not null default now(),
  entity_type     text not null,
  entity_id       uuid,
  kind            text not null check (kind in ('inserted', 'updated', 'deleted')),
  actor_id        uuid,
  payload         jsonb not null default '{}'::jsonb
);

create index domain_events_org_time_idx
  on public.domain_events (organization_id, occurred_at desc);

alter table public.domain_events enable row level security;

-- A firm member reads the events of their own firm. Clients get their own
-- policy in the collaboration wave once engagements drive it.
create policy "firm reads its own domain events" on public.domain_events
  for select to authenticated
  using (exists (
    select 1
      from public.firm_members fm
     where fm.auth_user_id = auth.uid()
       and fm.organization_id = domain_events.organization_id
       and fm.active
  ));

alter publication supabase_realtime add table domain_events;

-- The capture trigger. SECURITY DEFINER so a caller who may write the business
-- row is never required to also hold INSERT on the event table; the event is a
-- by-product of the change, not a second permission.
create or replace function private.domain_event_capture()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_row record;
  v_payload jsonb;
begin
  if tg_op = 'DELETE' then v_row := old; v_payload := to_jsonb(old); else v_row := new; v_payload := to_jsonb(new); end if;

  insert into public.domain_events
    (organization_id, entity_type, entity_id, kind, actor_id, payload)
  values
    ((v_payload ->> 'organization_id')::uuid, tg_table_name,
     (v_payload ->> 'id')::uuid,
     case tg_op when 'INSERT' then 'inserted' when 'UPDATE' then 'updated' else 'deleted' end,
     auth.uid(), v_payload);

  return coalesce(new, old);
end
$fn$;

create trigger domain_events_document_requests
  after insert or update or delete on public.document_requests
  for each row execute function private.domain_event_capture();

create trigger domain_events_messages
  after insert or update or delete on public.messages
  for each row execute function private.domain_event_capture();

create trigger domain_events_message_threads
  after insert or update or delete on public.message_threads
  for each row execute function private.domain_event_capture();

create trigger domain_events_compliance_cases
  after insert or update or delete on public.compliance_cases
  for each row execute function private.domain_event_capture();

create trigger domain_events_invoices
  after insert or update or delete on public.invoices
  for each row execute function private.domain_event_capture();

create trigger domain_events_service_payments
  after insert or update or delete on public.service_payments
  for each row execute function private.domain_event_capture();
