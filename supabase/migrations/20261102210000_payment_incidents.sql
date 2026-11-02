-- Payment-incident recovery (Phase 6, phase 1 of the taxpayer-first slice).
--
-- The prototype in lib/incidents.ts has modelled this since 27 Oct with no
-- backend. These tables give it one, keeping the engine's contract: a debit is
-- never "verified", only a reviewer citing official evidence can verify, and
-- the event log is append-only.
--
-- Deliberately not modelled here: the ACF status machine (it belongs to
-- tax_attestations), and any notion that Kima contacts the administration.

create table public.payment_incidents (
  id               uuid primary key default gen_random_uuid(),
  taxpayer_id      uuid not null references public.taxpayers(id) on delete cascade,
  reported_by      text not null check (reported_by in ('taxpayer', 'firm')),
  type             text not null check (type in ('payment_step_error', 'debit_not_recognised', 'certificate_blocked')),
  status           text not null default 'open' check (status in ('open', 'escalated', 'awaiting_administration', 'resolved', 'closed_unresolved')),
  observed_at      timestamptz not null,
  amount_minor     bigint check (amount_minor is null or amount_minor >= 0),
  portal_key       text,
  attempted_step   text,
  reported_error   text,
  payment_state    text not null default 'unknown' check (payment_state in ('not_applicable', 'unknown', 'attempted', 'debit_observed', 'reference_recorded', 'verified', 'disputed')),
  reference_masked text check (reference_masked is null or char_length(reference_masked) <= 8),
  resolution_outcome text check (resolution_outcome in ('payment_confirmed', 'certificate_issued', 'withdrawn', 'no_answer', 'other')),
  resolution_reason  text,
  verified_by      text,
  verified_at      timestamptz,
  created_at       timestamptz not null default now(),
  -- A resolution always states why.
  constraint incident_resolution_needs_reason
    check ((resolution_outcome is null) = (resolution_reason is null)),
  -- Verification always names who and when.
  constraint incident_verified_needs_actor
    check (payment_state <> 'verified' or (verified_by is not null and verified_at is not null))
);

comment on table public.payment_incidents is
  'A taxpayer payment that did not complete cleanly. The debit, the reference and the evidence are separate facts: a debit alone never reaches payment_state=verified, which requires a named reviewer and an official evidence row (enforced by trigger).';

create index payment_incidents_taxpayer_idx on public.payment_incidents (taxpayer_id, created_at desc);

create table public.incident_evidence (
  id          uuid primary key default gen_random_uuid(),
  incident_id uuid not null references public.payment_incidents(id) on delete cascade,
  kind        text not null check (kind in ('debit_sms', 'wallet_screenshot', 'bank_statement', 'portal_screenshot', 'official_receipt', 'administration_response', 'other')),
  label       text not null,
  captured_at timestamptz not null,
  added_by    text not null check (added_by in ('taxpayer', 'reviewer')),
  created_at  timestamptz not null default now()
);

create index incident_evidence_incident_idx on public.incident_evidence (incident_id);

create table public.incident_contacts (
  id            uuid primary key default gen_random_uuid(),
  incident_id   uuid not null references public.payment_incidents(id) on delete cascade,
  contacted_at  timestamptz not null default now(),
  channel       text not null check (channel in ('phone', 'in_person', 'email', 'online_form', 'other')),
  counterparty  text not null,
  ticket_masked text,
  response      text,
  unresolved    text,
  recorded_by   text not null check (recorded_by in ('taxpayer', 'reviewer')),
  created_at    timestamptz not null default now()
);

create table public.incident_events (
  id          uuid primary key default gen_random_uuid(),
  incident_id uuid not null references public.payment_incidents(id) on delete cascade,
  kind        text not null check (kind in ('incident_reported', 'incident_type_changed', 'payment_changed', 'reference_recorded', 'incident_status_changed', 'incident_evidence_added', 'support_contact_logged')),
  actor_role  text not null check (actor_role in ('taxpayer', 'reviewer')),
  actor_label text not null,
  basis       text not null check (basis in ('declared', 'recorded', 'verified')),
  from_value  text,
  to_value    text,
  note        text,
  evidence_ids uuid[] not null default '{}',
  at          timestamptz not null default now()
);

create index incident_events_incident_idx on public.incident_events (incident_id, at);

-- Verification guard: the database, not the screen, decides what "verified" means.
create or replace function private.incident_verify_guard()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.taxpayer_id is distinct from old.taxpayer_id then
    raise exception 'an incident never changes taxpayer';
  end if;

  if new.payment_state = 'verified' and old.payment_state is distinct from 'verified' then
    if new.verified_by is null then
      raise exception 'verification requires a named reviewer';
    end if;
    if not exists (
      select 1 from public.incident_evidence e
       where e.incident_id = new.id
         and e.kind in ('official_receipt', 'administration_response')
    ) then
      raise exception 'verification requires official evidence, not a taxpayer screenshot';
    end if;
  end if;

  if old.payment_state = 'verified' and new.payment_state = 'verified'
     and (new.verified_by is distinct from old.verified_by or new.verified_at is distinct from old.verified_at) then
    raise exception 'a verification is not rewritten';
  end if;

  return new;
end;
$$;

create trigger payment_incidents_verify_guard
  before update on public.payment_incidents
  for each row execute function private.incident_verify_guard();

alter table public.payment_incidents enable row level security;
alter table public.incident_evidence enable row level security;
alter table public.incident_contacts enable row level security;
alter table public.incident_events enable row level security;

create policy "participants read incidents" on public.payment_incidents
  for select to authenticated using (private.can_see_taxpayer(taxpayer_id));
create policy "participants open incidents" on public.payment_incidents
  for insert to authenticated with check (private.can_see_taxpayer(taxpayer_id));
create policy "participants update incidents" on public.payment_incidents
  for update to authenticated using (private.can_see_taxpayer(taxpayer_id));

create policy "participants read evidence" on public.incident_evidence
  for select to authenticated using (exists (select 1 from public.payment_incidents i where i.id = incident_id and private.can_see_taxpayer(i.taxpayer_id)));
create policy "participants add evidence" on public.incident_evidence
  for insert to authenticated with check (exists (select 1 from public.payment_incidents i where i.id = incident_id and private.can_see_taxpayer(i.taxpayer_id)));

create policy "participants read contacts" on public.incident_contacts
  for select to authenticated using (exists (select 1 from public.payment_incidents i where i.id = incident_id and private.can_see_taxpayer(i.taxpayer_id)));
create policy "participants log contacts" on public.incident_contacts
  for insert to authenticated with check (exists (select 1 from public.payment_incidents i where i.id = incident_id and private.can_see_taxpayer(i.taxpayer_id)));

create policy "participants read incident events" on public.incident_events
  for select to authenticated using (exists (select 1 from public.payment_incidents i where i.id = incident_id and private.can_see_taxpayer(i.taxpayer_id)));
create policy "participants append incident events" on public.incident_events
  for insert to authenticated with check (exists (select 1 from public.payment_incidents i where i.id = incident_id and private.can_see_taxpayer(i.taxpayer_id)));

revoke all on public.payment_incidents from anon;
revoke all on public.incident_evidence from anon;
revoke all on public.incident_contacts from anon;
revoke all on public.incident_events from anon;
grant select, insert, update on public.payment_incidents to authenticated;
grant select, insert on public.incident_evidence to authenticated;
grant select, insert on public.incident_contacts to authenticated;
grant select, insert on public.incident_events to authenticated;
-- The timeline is append-only from any client key.
revoke update, delete, truncate on public.incident_events from authenticated;
