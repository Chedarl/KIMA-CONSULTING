-- Failing-first pgTAP coverage for remaining isolated-staging FK warnings.
-- The integration base has no indexes named below; tests must fail until
-- the forward-only migration is applied. No data is written; rollback always.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select plan(21);

with keys(tbl, col, idx) as (
  values
    ('account_tags', 'tag_id', 'account_tags_tag_id_idx'),
    ('accounting_periods', 'taxpayer_id', 'accounting_periods_taxpayer_id_idx'),
    ('audit_events', 'actor_member_id', 'audit_events_actor_member_id_idx'),
    ('case_events', 'taxpayer_id', 'case_events_taxpayer_id_idx'),
    ('documents', 'request_id', 'documents_request_id_idx'),
    ('engagements', 'taxpayer_id', 'engagements_taxpayer_id_idx'),
    ('messages', 'request_id', 'messages_request_id_idx'),
    ('portal_accounts', 'contact_id', 'portal_accounts_contact_id_idx'),
    ('validation_findings', 'taxpayer_id', 'validation_findings_taxpayer_id_idx')
)
select is(
  (select pg_get_indexdef(indexrelid, 1, true) from pg_index
   where indexrelid = to_regclass('public.' || idx)),
  col, 'P2-FK ' || tbl || '.' || col || ' is the leading index key'
) from keys;

with keys(idx) as (
  values
    ('account_tags_tag_id_idx'),
    ('accounting_periods_taxpayer_id_idx'),
    ('audit_events_actor_member_id_idx'),
    ('case_events_taxpayer_id_idx'),
    ('documents_request_id_idx'),
    ('engagements_taxpayer_id_idx'),
    ('messages_request_id_idx'),
    ('portal_accounts_contact_id_idx'),
    ('validation_findings_taxpayer_id_idx')
)
select ok(
  coalesce((select indisvalid from pg_index
            where indexrelid = to_regclass('public.' || idx)), false),
  'P2-FK ' || idx || ' is valid'
) from keys;

select is(
  (select pg_get_indexdef(indexrelid, 1, true) from pg_index
   where indexrelid = to_regclass('public.document_requests_case_taxpayer_idx')),
  'case_id', 'P2-FK composite request FK leads with case_id');
select is(
  (select pg_get_indexdef(indexrelid, 2, true) from pg_index
   where indexrelid = to_regclass('public.document_requests_case_taxpayer_idx')),
  'taxpayer_id', 'P2-FK composite request FK includes taxpayer_id second');
select ok(
  coalesce((select indisvalid from pg_index
            where indexrelid = to_regclass('public.document_requests_case_taxpayer_idx')), false),
  'P2-FK composite request FK index is valid');

select * from finish();
rollback;
