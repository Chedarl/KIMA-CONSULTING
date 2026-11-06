-- Phase 2 isolated staging Performance Advisor (2026-10-31):
-- cover the remaining unindexed foreign keys. Existing single-column
-- document_requests(case_id) index does NOT cover its composite
-- (case_id, taxpayer_id) FK, so add that composite key separately.
-- No RLS, grants, app flags, or tenant data are changed.
-- Forward-only and safe to replay on a clean database.

create index if not exists account_tags_tag_id_idx
  on public.account_tags (tag_id);

create index if not exists accounting_periods_taxpayer_id_idx
  on public.accounting_periods (taxpayer_id);

create index if not exists audit_events_actor_member_id_idx
  on public.audit_events (actor_member_id);

create index if not exists case_events_taxpayer_id_idx
  on public.case_events (taxpayer_id);

create index if not exists documents_request_id_idx
  on public.documents (request_id);

create index if not exists engagements_taxpayer_id_idx
  on public.engagements (taxpayer_id);

create index if not exists messages_request_id_idx
  on public.messages (request_id);

create index if not exists portal_accounts_contact_id_idx
  on public.portal_accounts (contact_id);

create index if not exists validation_findings_taxpayer_id_idx
  on public.validation_findings (taxpayer_id);

create index if not exists document_requests_case_taxpayer_idx
  on public.document_requests (case_id, taxpayer_id);
