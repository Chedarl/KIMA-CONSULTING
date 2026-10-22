-- F3 · The activity log, and the request -> case chain.
--
-- One change, recorded once. Every surface reads its history from this table
-- instead of each keeping its own notion of what happened, which is how a
-- document ends up reading "accepted" in the portal and "awaiting review" in
-- the firm inbox.
--
-- APPEND-ONLY BY GRANT, not by convention: no UPDATE or DELETE policy exists
-- and the privileges are revoked, so a history cannot be quietly rewritten
-- even by code that means well. An audit log that can be edited is not one.

create type case_event_dimension as enum (
  'work', 'filing', 'payment', 'billing', 'document', 'request', 'engagement', 'note'
);

-- The actor categories from the blueprint. Permissions themselves come next;
-- this enum exists now because an event with no actor is not auditable, and
-- the permissions work will reuse it rather than inventing a second vocabulary.
create type actor_role as enum (
  'client', 'firm_staff', 'firm_reviewer', 'firm_partner', 'kima_admin', 'system'
);

create type event_visibility as enum ('internal', 'client');

create table case_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid,
  case_id uuid not null references compliance_cases (id) on delete cascade,
  occurred_at timestamptz not null default now(),
  dimension case_event_dimension not null,
  -- A closed vocabulary. Adding a kind is a migration, which is the point:
  -- free-form event names are how two surfaces end up describing the same
  -- change in two different words.
  kind text not null,
  actor_role actor_role not null,
  actor_label text,
  from_value text,
  to_value text,
  -- The request, document or task this event concerns, when it concerns one.
  subject_ref text,
  reason text,
  visibility event_visibility not null,
  created_at timestamptz not null default now(),

  constraint event_kind_known check (kind in (
    'case_opened', 'stage_advanced', 'stage_returned', 'advance_refused',
    'owner_assigned', 'client_status_changed', 'case_closed', 'case_abandoned',
    'filing_attempted', 'filing_awaiting_verification', 'filing_verified',
    'filing_correction_required', 'filing_reset',
    'payment_evidence_requested', 'payment_evidence_received', 'payment_verified',
    'quotation_sent', 'quotation_accepted', 'invoice_issued', 'fee_paid', 'fee_outstanding',
    'document_uploaded', 'document_accepted', 'document_rejected',
    'request_created', 'request_attached', 'request_submitted',
    'request_returned', 'request_accepted',
    'engagement_authorized', 'engagement_accepted', 'engagement_revoked',
    'note_added'
  )),

  -- A change recorded with nobody's name on it cannot be audited. Only the
  -- system itself is allowed to be anonymous.
  constraint event_actor_named check (
    actor_role = 'system' or (actor_label is not null and length(btrim(actor_label)) > 0)
  ),

  -- A state change has to say where it went. A refusal and a note have no new
  -- value by nature, so they are the only exemptions.
  constraint event_records_outcome check (
    dimension = 'note' or kind = 'advance_refused' or to_value is not null
  ),

  -- THE LEAK GUARD. Client visibility is derived from the kind in
  -- lib/events.ts; this is the same rule in SQL, so a direct write cannot
  -- expose an internal review verdict or a refusal in the client portal.
  constraint event_visibility_allowed check (
    visibility = 'internal' or kind in (
      'case_opened', 'client_status_changed', 'case_closed', 'case_abandoned',
      'filing_attempted', 'filing_verified', 'filing_correction_required',
      'payment_evidence_requested', 'payment_verified',
      'document_uploaded',
      'request_created', 'request_submitted', 'request_returned', 'request_accepted',
      'engagement_authorized', 'engagement_accepted', 'engagement_revoked',
      'note_added'
    )
  ),

  -- Whether KIMA has been paid is never part of a compliance history. Stated
  -- separately from the whitelist so the intent survives someone editing it.
  constraint event_billing_never_client_facing check (
    dimension <> 'billing' or visibility = 'internal'
  )
);

create index case_events_case_time on case_events (case_id, occurred_at desc);

alter table case_events enable row level security;

create policy "demo reads case events" on case_events for select using (
  exists (
    select 1 from compliance_cases c
    where c.id = case_events.case_id and c.taxpayer_id = demo_taxpayer_id()
  )
);

create policy "demo writes case events" on case_events for insert with check (
  exists (
    select 1 from compliance_cases c
    where c.id = case_events.case_id and c.taxpayer_id = demo_taxpayer_id()
  )
);

-- No update, no delete. Deliberately absent, and revoked besides.
revoke update, delete on case_events from anon, authenticated;

-- -------------------------------------------------------------------------
-- The request -> case chain
-- -------------------------------------------------------------------------

-- A request carries no period of its own; it inherits the period from the case
-- it serves, which is why this link matters beyond tidiness. The composite key
-- makes it impossible for a request to attach to ANOTHER taxpayer's case --
-- declaratively, with no trigger and no application code to trust.
create unique index compliance_cases_id_taxpayer on compliance_cases (id, taxpayer_id);

alter table document_requests
  add constraint document_requests_case_same_taxpayer
  foreign key (case_id, taxpayer_id)
  references compliance_cases (id, taxpayer_id)
  on delete set null;

-- Tenant scoping, which this table never had. Its three policies read
-- `using (true)`, so every request was visible to every caller while the cases
-- they now hang off are scoped -- an inconsistency the chain above would make
-- load-bearing. All 5 rows belong to the demo taxpayer, so nothing is lost.
drop policy "demo_rw_requests_select" on document_requests;
drop policy "demo_rw_requests_insert" on document_requests;
drop policy "demo_rw_requests_update" on document_requests;

create policy "demo reads own requests" on document_requests for select
  using (taxpayer_id = demo_taxpayer_id());
create policy "demo writes own requests" on document_requests for insert
  with check (taxpayer_id = demo_taxpayer_id());
create policy "demo updates own requests" on document_requests for update
  using (taxpayer_id = demo_taxpayer_id())
  with check (taxpayer_id = demo_taxpayer_id());

-- -------------------------------------------------------------------------
-- A latent defect, fixed
-- -------------------------------------------------------------------------

-- `authorized_at` was NOT NULL, so every engagement row was authorised the
-- moment it existed -- and authorityCheck's `engagement_not_authorized` branch
-- could never be reached from real data. An engagement the firm has drafted but
-- the client has not yet authorised is a real and common state.
alter table engagements alter column authorized_at drop not null;

comment on table case_events is
  'Append-only history of every state change on a case. One write, read by every surface. No UPDATE or DELETE policy exists by design.';
