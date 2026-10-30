-- D6 and the D2 fix: who may report, read and confirm a fee payment
-- (service_payments). Migrations 20261027210000 and 20261027210100.
-- Every refusal is paired with an allowed control, so a policy that refuses
-- everything cannot pass by accident.
-- Run with `supabase test db` (pgTAP). Synthetic data only; rolled back.

begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(24);

-- ---------------------------------------------------------------------------
-- Fixture: one firm, taxpayers A and B, one client each, a partner, a staff.
-- ---------------------------------------------------------------------------
insert into auth.users (id, email) values
  ('00000000-0000-4000-b000-0000000001aa', 'fee-client-a@example.test'),
  ('00000000-0000-4000-b000-0000000001bb', 'fee-client-b@example.test'),
  ('00000000-0000-4000-b000-0000000001ee', 'fee-partner@example.test'),
  ('00000000-0000-4000-b000-0000000001dd', 'fee-staff@example.test');
insert into organizations (id, name) values ('00000000-0000-4000-b000-0000000000f0', 'Fee test firm');
insert into taxpayers (id, legal_name) values
  ('00000000-0000-4000-b000-00000000000a', 'Fee Taxpayer A'),
  ('00000000-0000-4000-b000-00000000000b', 'Fee Taxpayer B');
-- The firm's authorised grant for each taxpayer. Required since
-- 20261029213000: a firm reaches a taxpayer only through its own engagement.
insert into engagements (organization_id, taxpayer_id) values
  ('00000000-0000-4000-b000-0000000000f0', '00000000-0000-4000-b000-00000000000a'),
  ('00000000-0000-4000-b000-0000000000f0', '00000000-0000-4000-b000-00000000000b');
insert into contacts (id, organization_id, full_name, email, auth_user_id) values
  ('00000000-0000-4000-b000-0000000000ca', '00000000-0000-4000-b000-0000000000f0', 'Fee Client A', 'fee-client-a@example.test', '00000000-0000-4000-b000-0000000001aa'),
  ('00000000-0000-4000-b000-0000000000cb', '00000000-0000-4000-b000-0000000000f0', 'Fee Client B', 'fee-client-b@example.test', '00000000-0000-4000-b000-0000000001bb');
insert into contact_account_links (contact_id, taxpayer_id, portal_access) values
  ('00000000-0000-4000-b000-0000000000ca', '00000000-0000-4000-b000-00000000000a', true),
  ('00000000-0000-4000-b000-0000000000cb', '00000000-0000-4000-b000-00000000000b', true);
insert into firm_members (id, organization_id, person_label, email, role, auth_user_id) values
  ('00000000-0000-4000-b000-0000000000ee', '00000000-0000-4000-b000-0000000000f0', 'Test Partner', 'fee-partner@example.test', 'firm_partner', '00000000-0000-4000-b000-0000000001ee'),
  ('00000000-0000-4000-b000-0000000000dd', '00000000-0000-4000-b000-0000000000f0', 'Test Staff', 'fee-staff@example.test', 'firm_staff', '00000000-0000-4000-b000-0000000001dd');

insert into invoices (id, organization_id, taxpayer_id, number, description_fr, description_en, total_minor, status, issued_on, due_on) values
  ('00000000-0000-4000-b000-0000000000a1', '00000000-0000-4000-b000-0000000000f0', '00000000-0000-4000-b000-00000000000a', 'T-A1', 'Honoraires A', 'Fees A', 15000, 'issued', '2026-10-01', '2026-10-31'),
  ('00000000-0000-4000-b000-0000000000b1', '00000000-0000-4000-b000-0000000000f0', '00000000-0000-4000-b000-00000000000b', 'T-B1', 'Honoraires B', 'Fees B', 15000, 'issued', '2026-10-01', '2026-10-31'),
  ('00000000-0000-4000-b000-0000000000a2', '00000000-0000-4000-b000-0000000000f0', '00000000-0000-4000-b000-00000000000a', 'T-A2', 'Brouillon A', 'Draft A', 9000, 'draft', null, null);

-- Taxpayer B already has a reported payment (e01); client A must never see it.
-- e03 is a second pending payment of A, for the review-guard tests.
insert into service_payments (id, invoice_id, taxpayer_id, organization_id, amount_minor, method, status, reported_by) values
  ('00000000-0000-4000-b000-000000000e01', '00000000-0000-4000-b000-0000000000b1', '00000000-0000-4000-b000-00000000000b', '00000000-0000-4000-b000-0000000000f0', 5000, 'mtn_momo', 'pending_confirmation', 'taxpayer'),
  ('00000000-0000-4000-b000-000000000e03', '00000000-0000-4000-b000-0000000000a1', '00000000-0000-4000-b000-00000000000a', '00000000-0000-4000-b000-0000000000f0', 2000, 'cash', 'pending_confirmation', 'taxpayer');

-- ---------------------------------------------------------------------------
-- As client A
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-b000-0000000001aa","role":"authenticated"}', true);

-- F-01 control: the panel's own insert, for A's own issued invoice.
select lives_ok(
  $$ insert into service_payments (id, invoice_id, taxpayer_id, organization_id, amount_minor, method, status, provider_reference, reported_by)
     values ('00000000-0000-4000-b000-000000000e02', '00000000-0000-4000-b000-0000000000a1', '00000000-0000-4000-b000-00000000000a',
             '00000000-0000-4000-b000-0000000000f0', 5000, 'mtn_momo', 'pending_confirmation', 'MP-CLIENT-1', 'taxpayer') $$,
  'F-01 control: a client reports a payment on their own invoice'
);
-- F-02
select throws_ok(
  $$ insert into service_payments (invoice_id, taxpayer_id, organization_id, amount_minor, method, status, reported_by)
     values ('00000000-0000-4000-b000-0000000000b1', '00000000-0000-4000-b000-00000000000b',
             '00000000-0000-4000-b000-0000000000f0', 5000, 'mtn_momo', 'pending_confirmation', 'taxpayer') $$,
  '42501', null,
  'F-02 a client cannot report a payment on another taxpayer''s invoice'
);
select throws_ok(
  $$ insert into service_payments (invoice_id, taxpayer_id, organization_id, amount_minor, method, status, reported_by)
     values ('00000000-0000-4000-b000-0000000000b1', '00000000-0000-4000-b000-00000000000a',
             '00000000-0000-4000-b000-0000000000f0', 5000, 'mtn_momo', 'pending_confirmation', 'taxpayer') $$,
  '42501', null,
  'F-02 a client cannot file another taxpayer''s invoice under their own taxpayer'
);
-- F-03
select throws_ok(
  $$ insert into service_payments (invoice_id, taxpayer_id, organization_id, amount_minor, method, status, provider_reference, reported_by, confirmed_at, confirmed_by)
     values ('00000000-0000-4000-b000-0000000000a1', '00000000-0000-4000-b000-00000000000a',
             '00000000-0000-4000-b000-0000000000f0', 5000, 'mtn_momo', 'confirmed', 'MP-1', 'taxpayer', now(), 'Fee Client A') $$,
  '42501', null,
  'F-03 a client cannot insert a confirmed payment'
);
select throws_ok(
  $$ insert into service_payments (invoice_id, taxpayer_id, organization_id, amount_minor, method, status, reported_by, confirmed_by)
     values ('00000000-0000-4000-b000-0000000000a1', '00000000-0000-4000-b000-00000000000a',
             '00000000-0000-4000-b000-0000000000f0', 5000, 'mtn_momo', 'pending_confirmation', 'taxpayer', 'Fee Client A') $$,
  '42501', null,
  'F-03 a client cannot set a confirmation field on a report'
);
select throws_ok(
  $$ insert into service_payments (invoice_id, taxpayer_id, organization_id, amount_minor, method, status, reported_by)
     values ('00000000-0000-4000-b000-0000000000a1', '00000000-0000-4000-b000-00000000000a',
             '00000000-0000-4000-b000-0000000000f0', 5000, 'mtn_momo', 'pending_confirmation', 'firm') $$,
  '42501', null,
  'F-03 a client cannot report as the firm'
);
select throws_ok(
  $$ insert into service_payments (invoice_id, taxpayer_id, organization_id, amount_minor, method, status, reported_by)
     values ('00000000-0000-4000-b000-0000000000a2', '00000000-0000-4000-b000-00000000000a',
             '00000000-0000-4000-b000-0000000000f0', 5000, 'mtn_momo', 'pending_confirmation', 'taxpayer') $$,
  '42501', null,
  'F-03 a client cannot report a payment on a draft invoice'
);
select throws_ok(
  $$ insert into service_payments (invoice_id, taxpayer_id, organization_id, amount_minor, method, status, reported_by, created_at)
     values ('00000000-0000-4000-b000-0000000000a1', '00000000-0000-4000-b000-00000000000a',
             '00000000-0000-4000-b000-0000000000f0', 5000, 'mtn_momo', 'pending_confirmation', 'taxpayer', '2026-01-01') $$,
  '42501', null,
  'F-03 a client cannot backdate a report'
);

-- F-04
select is(
  (select count(*)::int from service_payments where taxpayer_id = '00000000-0000-4000-b000-00000000000b'),
  0,
  'F-04 a client sees none of another taxpayer''s payments'
);
select is(
  (select count(*)::int from service_payments where id = '00000000-0000-4000-b000-000000000e01'),
  0,
  'F-04 a client cannot read another taxpayer''s payment by id'
);
select is(
  (select count(*)::int from service_payments),
  2,
  'F-04 control: a client sees exactly their own two payments'
);

-- A client has no update path: the row is untouched.
update service_payments set status = 'confirmed', confirmed_at = now(), confirmed_by = 'Fee Client A'
  where id = '00000000-0000-4000-b000-000000000e02';
reset role;
select is(
  (select status from service_payments where id = '00000000-0000-4000-b000-000000000e02'),
  'pending_confirmation',
  'F-05 a client cannot confirm their own report'
);

-- ---------------------------------------------------------------------------
-- As client B
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-b000-0000000001bb","role":"authenticated"}', true);
select is(
  (select count(*)::int from service_payments where taxpayer_id = '00000000-0000-4000-b000-00000000000a'),
  0,
  'F-04 client B sees none of taxpayer A''s payments'
);
select is(
  (select count(*)::int from service_payments),
  1,
  'F-04 control: client B sees their own payment'
);
reset role;

-- ---------------------------------------------------------------------------
-- As the partner (billing.manage): the review is final and stamped (D2 fix)
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-b000-0000000001ee","role":"authenticated"}', true);

select throws_ok(
  $$ update service_payments set amount_minor = 1
     where id = '00000000-0000-4000-b000-000000000e03' $$,
  '42501', null,
  'R-01 a partner cannot rewrite the amount a payer reported'
);
select throws_ok(
  $$ update service_payments set status = 'confirmed', amount_minor = 1, provider_reference = 'REC-X'
     where id = '00000000-0000-4000-b000-000000000e03' $$,
  '42501', null,
  'R-01 a partner cannot change the amount while confirming'
);
select lives_ok(
  $$ update service_payments
     set status = 'confirmed', provider_reference = 'REC-9',
         confirmed_by = 'Somebody Else', confirmed_at = '2020-01-01'
     where id = '00000000-0000-4000-b000-000000000e02' $$,
  'R-02 control: a partner confirms a pending payment with a reference'
);
select throws_ok(
  $$ update service_payments set status = 'rejected', confirmed_at = null, confirmed_by = null
     where id = '00000000-0000-4000-b000-000000000e02' $$,
  '42501', null,
  'R-03 a confirmed payment cannot be reopened or rejected'
);
select lives_ok(
  $$ update service_payments set status = 'rejected'
     where id = '00000000-0000-4000-b000-000000000e03' $$,
  'R-03 control: a partner rejects a pending payment'
);
select throws_ok(
  $$ update service_payments set status = 'pending_confirmation'
     where id = '00000000-0000-4000-b000-000000000e03' $$,
  '42501', null,
  'R-03 a rejected payment cannot be reopened'
);
reset role;

select is(
  (select confirmed_by from service_payments where id = '00000000-0000-4000-b000-000000000e02'),
  'Test Partner',
  'R-02 the database stamps who confirmed, not the browser'
);
select ok(
  (select confirmed_at > '2020-01-02'::timestamptz from service_payments where id = '00000000-0000-4000-b000-000000000e02'),
  'R-02 the database stamps when it was confirmed'
);

-- ---------------------------------------------------------------------------
-- As firm staff (payment.record, not billing.manage)
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-b000-0000000001dd","role":"authenticated"}', true);
select throws_ok(
  $$ insert into service_payments (invoice_id, taxpayer_id, organization_id, amount_minor, method, status, provider_reference, reported_by, confirmed_at, confirmed_by)
     values ('00000000-0000-4000-b000-0000000000a1', '00000000-0000-4000-b000-00000000000a',
             '00000000-0000-4000-b000-0000000000f0', 3000, 'bank_transfer', 'confirmed', 'VIR-1', 'firm', now(), 'Test Staff') $$,
  '42501', null,
  'R-04 staff cannot insert a payment already confirmed'
);
select lives_ok(
  $$ insert into service_payments (invoice_id, taxpayer_id, organization_id, amount_minor, method, status, provider_reference, reported_by)
     values ('00000000-0000-4000-b000-0000000000a1', '00000000-0000-4000-b000-00000000000a',
             '00000000-0000-4000-b000-0000000000f0', 3000, 'bank_transfer', 'pending_confirmation', 'VIR-1', 'firm') $$,
  'R-04 control: staff records a pending payment as the firm'
);
reset role;

select * from finish();
rollback;
