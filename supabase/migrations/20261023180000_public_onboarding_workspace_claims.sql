-- Public onboarding claims.
--
-- A registration is still an unverified application, not a taxpayer file and
-- not an approved portal account. workspace_ref is a client-generated id that
-- correlates a later teammate invitation. Anon may insert and may not select,
-- so one applicant cannot read another's row.
--
-- This does not turn on membership-scoped tenant policies. Those remain the
-- firm-side boundary. The columns are nullable (or defaulted) so existing
-- rows stay valid.

alter table public.registrations
  add column if not exists workspace_kind text,
  add column if not exists workspace_ref uuid,
  add column if not exists onboarding jsonb not null default '{}'::jsonb;

alter table public.registrations
  drop constraint if exists registrations_workspace_kind_known;

alter table public.registrations
  add constraint registrations_workspace_kind_known
  check (
    workspace_kind is null
    or workspace_kind in ('individual', 'business', 'accounting_firm')
  );

comment on column public.registrations.workspace_kind is
  'Coarse workspace the applicant asked for. accounting_firm is a practice request; taxpayer_type stays business_moral because the practice is a company. Not a verified classification.';

comment on column public.registrations.workspace_ref is
  'Client-generated id for this application. Correlates workspace_invites. Not a Postgres tenant and not a taxpayer id. Anon cannot select the row.';

comment on column public.registrations.onboarding is
  'Unverified claims from the public wizard: city, sector, services, secondary contact, note, and isolation = private_application.';

create index if not exists registrations_workspace_ref_idx
  on public.registrations (workspace_ref);

create table if not exists public.workspace_invites (
  id uuid primary key default gen_random_uuid(),
  workspace_ref uuid not null,
  email text not null,
  created_at timestamptz not null default now(),
  constraint workspace_invites_email_shape check (position('@' in email) > 1)
);

comment on table public.workspace_invites is
  'Teammate email captured after onboarding. Insert-only for anon. No select policy: the address is not readable back through the public key. Access is not granted by this row.';

alter table public.workspace_invites enable row level security;

drop policy if exists "anyone may record a workspace invite" on public.workspace_invites;
create policy "anyone may record a workspace invite"
  on public.workspace_invites
  for insert
  with check (char_length(email) between 3 and 200);

revoke all on public.workspace_invites from public, anon, authenticated;
grant insert on public.workspace_invites to anon, authenticated;
