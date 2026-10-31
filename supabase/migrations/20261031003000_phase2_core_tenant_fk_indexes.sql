-- Phase 2 isolated-staging Performance Advisor (2026-10-31):
-- cover core tenant foreign keys. No RLS, grants, or signup flags change.
-- Forward-only; each index uses the exact single-column FK key.

create index if not exists compliance_cases_organization_id_idx
  on public.compliance_cases (organization_id);

create index if not exists declarations_organization_id_idx
  on public.declarations (organization_id);

create index if not exists document_requests_organization_id_idx
  on public.document_requests (organization_id);

create index if not exists messages_organization_id_idx
  on public.messages (organization_id);

create index if not exists service_payments_organization_id_idx
  on public.service_payments (organization_id);

