-- Phase 2: tenant-key FK indexes, identified by isolated staging advisor.
-- These assertions deliberately fail on the integration base before the migration.
-- No application data is inserted; tests are rolled back.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select plan(6);

select is(
  (select pg_get_indexdef(indexrelid, 1, true)
     from pg_index where indexrelid = to_regclass('public.contacts_organization_id_idx')),
  'organization_id',
  'P2-FK-1 contacts has a leading organization_id lookup key');
select ok(
  coalesce((select indisvalid from pg_index
            where indexrelid = to_regclass('public.contacts_organization_id_idx')), false),
  'P2-FK-2 contacts tenant index is valid');

select is(
  (select pg_get_indexdef(indexrelid, 1, true)
     from pg_index where indexrelid = to_regclass('public.registrations_organization_id_idx')),
  'organization_id',
  'P2-FK-3 registration inbox has a leading organization_id key');
select ok(
  coalesce((select indisvalid from pg_index
            where indexrelid = to_regclass('public.registrations_organization_id_idx')), false),
  'P2-FK-4 registration tenant index is valid');

select is(
  (select pg_get_indexdef(indexrelid, 1, true)
     from pg_index where indexrelid = to_regclass('public.registrations_taxpayer_id_idx')),
  'taxpayer_id',
  'P2-FK-5 registration approval has a leading taxpayer_id key');
select ok(
  coalesce((select indisvalid from pg_index
            where indexrelid = to_regclass('public.registrations_taxpayer_id_idx')), false),
  'P2-FK-6 registration taxpayer index is valid');

select * from finish();
rollback;
