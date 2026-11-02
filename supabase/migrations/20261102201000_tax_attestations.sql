-- Attestation register (Compliance Radar).
--
-- Cameroon makes a firm's clients prove tax compliance constantly: tenders,
-- bank facilities, and payments from large buyers all ask for an Attestation de
-- Conformité Fiscale (ACF), and an expired one silently blocks a bid. Nothing in
-- the product tracked expiry, so a client could believe they were compliant.
--
-- This table records what a human entered and what document proves it. It does
-- NOT compute validity from a rule: no sourced duration for an ACF exists in
-- docs/foundation/cameroon-rule-corpus-research.md, and inventing one would
-- breach the "never invent regulatory rules" constraint. The expiry is declared
-- on the document by the issuing authority, and this table simply remembers it.

create table public.tax_attestations (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  taxpayer_id     uuid not null references public.taxpayers(id) on delete cascade,
  kind            text not null check (kind in ('ACF', 'ANR', 'NIU', 'OTHER')),
  reference       text,
  issued_on       date,
  expires_on      date,
  document_id     uuid references public.documents(id) on delete set null,
  recorded_by     uuid references public.firm_members(id) on delete set null,
  note            text,
  created_at      timestamptz not null default now(),
  constraint tax_attestations_dates_ordered check (expires_on is null or issued_on is null or expires_on >= issued_on)
);

comment on table public.tax_attestations is
  'Attestations a taxpayer holds (ACF, ANR, NIU), with the expiry stated on the document itself. Expiry is recorded, never derived: the product has no sourced rule for a validity duration, and this table must not become one.';

create index tax_attestations_taxpayer_idx on public.tax_attestations (taxpayer_id, expires_on);
create index tax_attestations_expiry_idx on public.tax_attestations (organization_id, expires_on) where expires_on is not null;

alter table public.tax_attestations enable row level security;

create policy "firm reads attestations" on public.tax_attestations
  for select to authenticated
  using (private.member_has('case.view', taxpayer_id));

create policy "firm records attestations" on public.tax_attestations
  for insert to authenticated
  with check (
    organization_id = private.current_member_org()
    and private.member_has('case.view', taxpayer_id)
  );

create policy "firm amends attestations" on public.tax_attestations
  for update to authenticated
  using (private.member_has('case.advance', taxpayer_id));

revoke all on public.tax_attestations from anon;
grant select, insert, update on public.tax_attestations to authenticated;
