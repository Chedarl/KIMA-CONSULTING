-- KIMA routing of unassigned applications (launch blocker; migration
-- 20261101000000_route_unassigned_registration). The inbox half is
-- list_unassigned_registrations() (20261031170000, unassigned_registration_
-- list_test); this file is the act: only a bound KIMA administrator routes an
-- unassigned application. As of 20261105141000 the function refuses every
-- caller before it writes. Synthetic data only; the whole file rolls back.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select plan(9);

-- Fixture: the KIMA root org with its admin, a working firm, a suspended firm,
-- and three applications -- unassigned-open, assigned, unassigned-closed.
insert into auth.users (id, email, email_confirmed_at) values
  ('00000000-0000-4000-e200-0000000000b1', 'kima-admin@route.test', now()),
  ('00000000-0000-4000-e200-0000000000b2', 'firm-partner@route.test', now());
insert into organizations (id, name, kind) values
  ('00000000-0000-4000-e200-0000000000b0', 'KIMA', 'kima'),
  ('00000000-0000-4000-e200-0000000000b1', 'Route Target Firm', 'firm');
insert into organizations (id, name, kind, suspended_at) values
  ('00000000-0000-4000-e200-0000000000b2', 'Suspended Firm', 'firm', now());
insert into firm_members (id, organization_id, person_label, email, role, auth_user_id) values
  ('00000000-0000-4000-e200-0000000000c1', '00000000-0000-4000-e200-0000000000b0',
   'KIMA Admin', 'kima-admin@route.test', 'kima_admin', '00000000-0000-4000-e200-0000000000b1'),
  ('00000000-0000-4000-e200-0000000000c2', '00000000-0000-4000-e200-0000000000b1',
   'Firm Partner', 'firm-partner@route.test', 'firm_partner', '00000000-0000-4000-e200-0000000000b2');
insert into registrations (id, organization_id, applicant_name, taxpayer_type, status) values
  ('00000000-0000-4000-e200-0000000000d1', null, 'Orphan Applicant', 'sarl', 'submitted'),
  ('00000000-0000-4000-e200-0000000000d2', '00000000-0000-4000-e200-0000000000b1', 'Assigned Applicant', 'sarl', 'submitted');
-- A decided application carries its decision with it (decision_is_recorded).
insert into registrations (id, organization_id, applicant_name, taxpayer_type, status,
                           decided_at, decided_by, decision_note) values
  ('00000000-0000-4000-e200-0000000000d3', null, 'Closed Applicant', 'sarl', 'rejected',
   now(), 'KIMA', 'Duplicate of an existing application.');

-- Routing refuses the bad calls before it touches a row.
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-e200-0000000000b1","role":"authenticated"}', true);
select throws_ok(
  $$ select route_unassigned_registration(
       '00000000-0000-4000-e200-0000000000d1', '00000000-0000-4000-e200-0000000000b1', 'short') $$,
  '42501', 'the applicant must confirm a suggestion before a firm is named',
  'RT-05 even a short reason does not assign');
select throws_ok(
  $$ select route_unassigned_registration(
       '00000000-0000-4000-e200-0000000000d1', '00000000-0000-4000-e200-0000000000b2',
       'Applicant asked for a francophone firm in Douala.') $$,
  '42501', 'the applicant must confirm a suggestion before a firm is named',
  'RT-06 a suspended firm is not assigned by this function');
select throws_ok(
  $$ select route_unassigned_registration(
       '00000000-0000-4000-e200-0000000000d1', '00000000-0000-4000-e200-0000000000b0',
       'Applicant asked for a francophone firm in Douala.') $$,
  '42501', 'the applicant must confirm a suggestion before a firm is named',
  'RT-07 the KIMA organisation is not assigned by this function');
select throws_ok(
  $$ select route_unassigned_registration(
       '00000000-0000-4000-e200-0000000000d2', '00000000-0000-4000-e200-0000000000b1',
       'Applicant asked for a francophone firm in Douala.') $$,
  '42501', 'the applicant must confirm a suggestion before a firm is named',
  'RT-08 an already-named application is not moved');
select throws_ok(
  $$ select route_unassigned_registration(
       '00000000-0000-4000-e200-0000000000d3', '00000000-0000-4000-e200-0000000000b1',
       'Applicant asked for a francophone firm in Douala.') $$,
  '42501', 'the applicant must confirm a suggestion before a firm is named',
  'RT-09 a closed application is not assigned here');

-- A non-admin cannot route at all, even with everything else valid.
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-e200-0000000000b2","role":"authenticated"}', true);
select throws_ok(
  $$ select route_unassigned_registration(
       '00000000-0000-4000-e200-0000000000d1', '00000000-0000-4000-e200-0000000000b1',
       'Applicant asked for a francophone firm in Douala.') $$,
  '42501', 'the applicant must confirm a suggestion before a firm is named',
  'RT-10 a firm partner cannot assign the application to his own firm');

-- The lawful route: admin, working firm, documented reason.
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-e200-0000000000b1","role":"authenticated"}', true);
select throws_ok(
  $$ select route_unassigned_registration(
       '00000000-0000-4000-e200-0000000000d1', '00000000-0000-4000-e200-0000000000b1',
       'Applicant asked for a francophone firm in Douala.') $$,
  '42501', 'the applicant must confirm a suggestion before a firm is named',
  'RT-11 a KIMA administrator cannot assign the firm either');

reset role;
select set_config('request.jwt.claims', '', true);
select ok(
  (select organization_id from registrations
    where id = '00000000-0000-4000-e200-0000000000d1') is null,
  'RT-12 the application stays unassigned');
select is(
  (select count(*) from audit_events
    where action = 'registration.routed'
      and resource_id = '00000000-0000-4000-e200-0000000000d1'),
  0::bigint,
  'RT-13 no routing audit row is written');

select * from finish();
rollback;
