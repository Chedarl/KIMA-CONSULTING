-- Failing-first regression: tenant-scoped FK indexes from the isolated staging
-- Performance Advisor, 2026-10-31. Tests run inside a rolled-back transaction.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select plan(10);

select is(
  (select pg_get_indexdef(indexrelid, 1, true)
   from pg_index where indexrelid=to_regclass('public.compliance_cases_organization_id_idx')),
  'organization_id', 'P2-TENANT-1 compliance_cases FK is indexed first');
select ok(
  coalesce((select indisvalid from pg_index
            where indexrelid=to_regclass('public.compliance_cases_organization_id_idx')), false),
  'P2-TENANT-2 compliance_cases FK index is valid');

select is(
  (select pg_get_indexdef(indexrelid, 1, true)
   from pg_index where indexrelid=to_regclass('public.declarations_organization_id_idx')),
  'organization_id', 'P2-TENANT-3 declarations FK is indexed first');
select ok(
  coalesce((select indisvalid from pg_index
            where indexrelid=to_regclass('public.declarations_organization_id_idx')), false),
  'P2-TENANT-4 declarations FK index is valid');

select is(
  (select pg_get_indexdef(indexrelid, 1, true)
   from pg_index where indexrelid=to_regclass('public.document_requests_organization_id_idx')),
  'organization_id', 'P2-TENANT-5 document_requests FK is indexed first');
select ok(
  coalesce((select indisvalid from pg_index
            where indexrelid=to_regclass('public.document_requests_organization_id_idx')), false),
  'P2-TENANT-6 document_requests FK index is valid');

select is(
  (select pg_get_indexdef(indexrelid, 1, true)
   from pg_index where indexrelid=to_regclass('public.messages_organization_id_idx')),
  'organization_id', 'P2-TENANT-7 messages FK is indexed first');
select ok(
  coalesce((select indisvalid from pg_index
            where indexrelid=to_regclass('public.messages_organization_id_idx')), false),
  'P2-TENANT-8 messages FK index is valid');

select is(
  (select pg_get_indexdef(indexrelid, 1, true)
   from pg_index where indexrelid=to_regclass('public.service_payments_organization_id_idx')),
  'organization_id', 'P2-TENANT-9 service_payments FK is indexed first');
select ok(
  coalesce((select indisvalid from pg_index
            where indexrelid=to_regclass('public.service_payments_organization_id_idx')), false),
  'P2-TENANT-10 service_payments FK index is valid');

select * from finish();
rollback;
