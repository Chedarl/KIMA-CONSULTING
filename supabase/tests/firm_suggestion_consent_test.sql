-- Suggestion grants nothing until the applicant accepts. Synthetic; rolled back.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select plan(25);

insert into auth.users (id, email) values
  ('00000000-0000-4000-e800-0000000000a1', 'sug-admin@example.test'),
  ('00000000-0000-4000-e800-0000000000a2', 'sug-partner@example.test');
insert into organizations (id, name, kind) values
  ('00000000-0000-4000-e800-0000000000b0', 'KIMA Suggest', 'kima'),
  ('00000000-0000-4000-e800-0000000000b1', 'Suggested Firm', 'firm'),
  ('00000000-0000-4000-e800-0000000000b2', 'Other Firm', 'firm');
insert into firm_members (id, organization_id, person_label, email, role, auth_user_id) values
  ('00000000-0000-4000-e800-0000000000c1', '00000000-0000-4000-e800-0000000000b0',
   'Suggest Admin', 'sug-admin@example.test', 'kima_admin', '00000000-0000-4000-e800-0000000000a1'),
  ('00000000-0000-4000-e800-0000000000c2', '00000000-0000-4000-e800-0000000000b1',
   'Suggest Partner', 'sug-partner@example.test', 'firm_partner', '00000000-0000-4000-e800-0000000000a2');
insert into registrations (id, organization_id, applicant_name, taxpayer_type, status, workspace_ref) values
  ('00000000-0000-4000-e800-0000000000d1', null, 'Waiting Applicant', 'sarl', 'submitted', '00000000-0000-4000-e800-0000000000e1'),
  ('00000000-0000-4000-e800-0000000000d2', null, 'Second Applicant', 'sarl', 'submitted', '00000000-0000-4000-e800-0000000000e2');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-e800-0000000000a2","role":"authenticated"}', true);
select throws_ok(
  $$ select suggest_firm_for_registration('00000000-0000-4000-e800-0000000000d1','00000000-0000-4000-e800-0000000000b1','Francophone firm in Douala, applicant wrote no preference.') $$,
  '42501', 'KIMA administrator required', 'SG-1 a firm cannot suggest itself');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-e800-0000000000a1","role":"authenticated"}', true);
select lives_ok(
  $$ select suggest_firm_for_registration('00000000-0000-4000-e800-0000000000d1','00000000-0000-4000-e800-0000000000b1','Francophone firm in Douala, applicant wrote no preference.') $$,
  'SG-2 the administrator records a suggestion');
select is(
  (select suggest_firm_for_registration('00000000-0000-4000-e800-0000000000d1','00000000-0000-4000-e800-0000000000b1','Francophone firm in Douala, applicant wrote no preference.')),
  (select suggest_firm_for_registration('00000000-0000-4000-e800-0000000000d1','00000000-0000-4000-e800-0000000000b1','Francophone firm in Douala, applicant wrote no preference.')),
  'SG-3 the same suggestion again returns the pending row');
select throws_ok(
  $$ select suggest_firm_for_registration('00000000-0000-4000-e800-0000000000d1','00000000-0000-4000-e800-0000000000b2','A different firm while one suggestion is still open.') $$,
  '22023', 'a suggestion is already pending', 'SG-4 a second firm cannot replace a pending suggestion');

reset role;
select is((select organization_id from registrations where id = '00000000-0000-4000-e800-0000000000d1'), null, 'SG-5 the application is still unassigned');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-e800-0000000000a2","role":"authenticated"}', true);
select is((select count(*) from registrations where id = '00000000-0000-4000-e800-0000000000d1'), 0::bigint, 'SG-6 the suggested firm cannot read the application');
select throws_ok($$ select count(*) from registration_firm_suggestions $$, '42501', null, 'SG-7 and cannot read the suggestion table');

reset role;
set local role anon;
select is((select firm_name from my_firm_suggestion('00000000-0000-4000-e800-0000000000e1')), 'Suggested Firm', 'SG-8 the applicant sees the firm name');
select lives_ok($$ select * from respond_to_firm_suggestion('00000000-0000-4000-e800-0000000000e1','decline') $$, 'SG-9 the applicant declines');
reset role;
select is((select organization_id from registrations where id = '00000000-0000-4000-e800-0000000000d1'), null, 'SG-10 decline grants nothing');

-- Stale: a pending suggestion must not move a firm already named on the row.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-e800-0000000000a1","role":"authenticated"}', true);
select lives_ok($$ select suggest_firm_for_registration('00000000-0000-4000-e800-0000000000d1','00000000-0000-4000-e800-0000000000b1','Suggested again, then the application is named elsewhere.') $$, 'SG-11 a new suggestion after decline');
reset role;
update registrations set organization_id = '00000000-0000-4000-e800-0000000000b2' where id = '00000000-0000-4000-e800-0000000000d1';
set local role anon;
select is((select outcome from respond_to_firm_suggestion('00000000-0000-4000-e800-0000000000e1','accept')), 'expired', 'SG-12 a stale suggestion cannot be accepted');
reset role;
select is((select count(*) from registration_firm_suggestions where registration_id = '00000000-0000-4000-e800-0000000000d1' and status = 'pending'), 0::bigint, 'SG-13 the stale suggestion is closed');
select is((select organization_id from registrations where id = '00000000-0000-4000-e800-0000000000d1'), '00000000-0000-4000-e800-0000000000b2'::uuid, 'SG-14 the firm already named stays');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-e800-0000000000a2","role":"authenticated"}', true);
select is((select count(*) from registrations where id = '00000000-0000-4000-e800-0000000000d1'), 0::bigint, 'SG-14 the suggested firm still cannot read it');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-e800-0000000000a1","role":"authenticated"}', true);
select lives_ok($$ select suggest_firm_for_registration('00000000-0000-4000-e800-0000000000d2','00000000-0000-4000-e800-0000000000b1','Second suggestion, to be expired before the applicant answers.') $$, 'SG-15 a second application can be suggested');
reset role;
update registration_firm_suggestions set expires_at = now() - interval '1 day' where registration_id = '00000000-0000-4000-e800-0000000000d2';
set local role anon;
select is((select outcome from respond_to_firm_suggestion('00000000-0000-4000-e800-0000000000e2','accept')), 'expired', 'SG-16 an expired suggestion cannot be accepted');
reset role;
select is((select organization_id from registrations where id = '00000000-0000-4000-e800-0000000000d2'), null, 'SG-17 expiry grants nothing');
select is((select status from registration_firm_suggestions where registration_id = '00000000-0000-4000-e800-0000000000d2'), 'expired', 'SG-18 the expiry is kept');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-e800-0000000000a1","role":"authenticated"}', true);
select lives_ok($$ select suggest_firm_for_registration('00000000-0000-4000-e800-0000000000d2','00000000-0000-4000-e800-0000000000b1','A second suggestion after the first one expired.') $$, 'SG-19 suggest again after expiry');
reset role;
set local role anon;
select is((select outcome from respond_to_firm_suggestion('00000000-0000-4000-e800-0000000000e2','accept')), 'accepted', 'SG-20 the applicant accepts');
reset role;
select is((select organization_id from registrations where id = '00000000-0000-4000-e800-0000000000d2'), '00000000-0000-4000-e800-0000000000b1'::uuid, 'SG-21 acceptance names that firm');
select is((select taxpayer_id from registrations where id = '00000000-0000-4000-e800-0000000000d2'), null, 'SG-22 acceptance links no taxpayer');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-e800-0000000000a2","role":"authenticated"}', true);
select is((select count(*) from registrations where id = '00000000-0000-4000-e800-0000000000d2'), 1::bigint, 'SG-23 the named firm can read it after acceptance');
select is((select count(*) from engagements where organization_id = '00000000-0000-4000-e800-0000000000b1'), 0::bigint, 'SG-24 acceptance creates no engagement');

select * from finish();
rollback;
