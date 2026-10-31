-- Phase 2: cover onboarding tenant foreign keys without changing RLS.
-- Isolated staging Performance Advisor (2026-10-30) flagged these three
-- unindexed references. Existing primary/unique indexes do not lead with
-- these keys. Separate indexes preserve equality lookups and FK maintenance.
-- Forward-only, idempotent on clean migration replay. Signup flag unchanged.

create index if not exists contacts_organization_id_idx
  on public.contacts (organization_id);

create index if not exists registrations_organization_id_idx
  on public.registrations (organization_id);

create index if not exists registrations_taxpayer_id_idx
  on public.registrations (taxpayer_id);
