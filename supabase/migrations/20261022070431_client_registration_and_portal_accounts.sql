-- Client registration. The half that was missing: a person can now approach
-- the firm, rather than only being entered by it.
--
-- Registration is a LIFECYCLE, not a boolean. A taxpayer who has applied is
-- not a client, and must not be treated as one: the profile they report is
-- unverified by definition, and the firm has to decide whether to act for them
-- at all. Running that as a state machine is also what makes it measurable —
-- the KPI timestamps are columns here, not something reconstructed from logs
-- afterwards.

do $$ begin
  create type public.registration_status as enum (
    'submitted',    -- the applicant sent the form
    'verifying',    -- the firm is checking identity and profile
    'needs_info',   -- the firm asked for something and is waiting
    'approved',     -- accepted; a taxpayer file exists and access is granted
    'rejected',     -- declined, with a recorded reason
    'withdrawn'     -- the applicant stopped
  );
exception when duplicate_object then null; end $$;

create table if not exists public.registrations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete set null,

  -- What the applicant typed. Nothing here is trusted: these are claims.
  applicant_name text not null,
  applicant_email text,
  applicant_phone text,
  taxpayer_type text not null,
  legal_name text,
  declared_niu text,
  declared_regime text,
  declared_centre text,

  -- Evidence of identity. A reference into storage, never the document itself.
  identity_document_ref text,

  status public.registration_status not null default 'submitted',

  -- KPI instrumentation. These exist as columns because a standard nobody can
  -- measure is a wish: see docs/foundation/client-registration-standard.md.
  submitted_at timestamptz not null default now(),
  first_response_at timestamptz,
  decided_at timestamptz,
  info_requests integer not null default 0,
  activated_at timestamptz,

  decided_by text,
  decision_note text,

  -- The file this became, once approved.
  taxpayer_id uuid references public.taxpayers(id) on delete set null,

  created_at timestamptz not null default now(),

  -- A decision must carry its reason and its moment. Enforced here rather than
  -- hoped for in the application, because an unexplained rejection is the one
  -- a client will dispute.
  constraint decision_is_recorded check (
    status not in ('approved','rejected')
    or (decided_at is not null and decided_by is not null)
  ),
  constraint rejection_has_a_reason check (
    status <> 'rejected' or decision_note is not null
  ),
  -- An approved registration must point at the file it produced, or the client
  -- has been told yes with nothing to sign in to.
  constraint approval_has_a_file check (
    status <> 'approved' or taxpayer_id is not null
  )
);

comment on table public.registrations is
  'Client applications and their lifecycle. Claims here are unverified by definition; a reviewer confirms the profile against official records before approval.';

create index if not exists registrations_status_idx on public.registrations (status);
create index if not exists registrations_submitted_idx on public.registrations (submitted_at);

-- Portal sign-in identity, separated from the taxpayer file.
--
-- Previously the login read the taxpayers table directly, which conflated
-- "this tax file exists" with "this person may sign in". They are different
-- facts with different lifecycles: access is granted, suspended and revoked
-- without the file changing at all.
create table if not exists public.portal_accounts (
  id uuid primary key default gen_random_uuid(),
  taxpayer_id uuid not null references public.taxpayers(id) on delete cascade,
  contact_id uuid references public.contacts(id) on delete set null,

  -- The identifier typed at sign-in, normalised: no spaces, no punctuation,
  -- upper case. Unique, so two files cannot claim the same number.
  identifier text not null unique,
  display_name text not null,

  status text not null default 'pending'
    check (status in ('pending','active','suspended','revoked')),

  -- NOT a password column, deliberately, and there is none.
  --
  -- The taxpayer number is not a secret: it is a mandatory mention on every
  -- invoice the client issues and is the DGI's own Harmony 2 username. Risk
  -- R-36. The production design is the identifier above plus a one-time code
  -- sent to the verified contact address — which is why these two columns
  -- exist now, so the flow can be switched on without a migration later.
  otp_hash text,
  otp_expires_at timestamptz,

  last_sign_in_at timestamptz,
  failed_attempts integer not null default 0,
  created_at timestamptz not null default now()
);

comment on column public.portal_accounts.otp_hash is
  'Reserved for the one-time code that replaces the taxpayer number as the secret (R-36). Never store a raw code here.';

create index if not exists portal_accounts_taxpayer_idx on public.portal_accounts (taxpayer_id);

alter table public.registrations enable row level security;
alter table public.portal_accounts enable row level security;

-- Anyone may apply; nobody may read the applications back. A registration form
-- that lets a stranger read other people's submissions would leak the NIU,
-- name and tax centre of every applicant.
create policy "anyone may submit a registration"
  on public.registrations for insert with check (true);

create policy "demo reads own registration"
  on public.registrations for select
  using (taxpayer_id is not null and taxpayer_id = public.demo_taxpayer_id());

create policy "demo reads own portal account"
  on public.portal_accounts for select
  using (taxpayer_id = public.demo_taxpayer_id());

-- Approval funnel, with every KPI defined once in SQL so the dashboard, the
-- report and the conversation cannot each compute it differently.
create or replace view public.registration_kpis as
select
  count(*)                                               as total,
  count(*) filter (where status = 'submitted')           as awaiting_triage,
  count(*) filter (where status = 'verifying')           as in_verification,
  count(*) filter (where status = 'needs_info')          as waiting_on_applicant,
  count(*) filter (where status = 'approved')            as approved,
  count(*) filter (where status = 'rejected')            as rejected,
  count(*) filter (where info_requests > 1)              as reworked_more_than_once,
  -- Hours, not days: the standard's targets are in hours and a day-level
  -- figure cannot show whether a one-working-day target was met.
  avg(extract(epoch from (first_response_at - submitted_at)) / 3600)
    filter (where first_response_at is not null)         as avg_hours_to_first_response,
  avg(extract(epoch from (decided_at - submitted_at)) / 3600)
    filter (where decided_at is not null)                as avg_hours_to_decision,
  avg(extract(epoch from (activated_at - decided_at)) / 3600)
    filter (where activated_at is not null)              as avg_hours_to_activation
from public.registrations;

comment on view public.registration_kpis is
  'The registration standard, computed once. Definitions in docs/foundation/client-registration-standard.md.';
