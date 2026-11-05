-- Suggestion grants nothing until the applicant accepts. Synthetic; rolled back.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select plan(13);

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
  ('00000000-0000-4000-e800-0000000000d1', null, 'Waiting Applicant', 'sarl', 'submitted',
   '00000000-0000-4000-e800-0000000000e1'),
  ('00000000-0000-4000-e800-0000000000d2', null, 'Second Applicant', 'sarl', 'submitted',
   '00000000-0000-4000-e800-0000000000e2');

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-e800-0000000000a2","role":"authenticated"}', true);
select throws_ok(
  $$ select suggest_firm_for_registration(
       '00000000-0000-4000-e800-0000000000d1', '00000000-0000-4000-e800-0000000000b1',
       'Francophone firm in Douala, applicant wrote no preference.') $$,
  '42501', 'KIMA administrator required',
  'SG-1 a firm cannot suggest itself');

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-e800-0000000000a1","role":"authenticated"}', true);
create temp table first_sug as
  select suggest_firm_for_registration(
    '00000000-0000-4000-e800-0000000000d1', '00000000-0000-4000-e800-0000000000b1',
    'Francophone firm in Douala, applicant wrote no preference.') as id;
select ok((select id from first_sug) is not null, 'SG-2 the administrator records a suggestion');
select is(
  (select suggest_firm_for_registration(
     '00000000-0000-4000-e800-0000000000d1', '00000000-0000-4000-e800-0000000000b1',
     'Francophone firm in Douala, applicant wrote no preference.')),
  (select id from first_sug),
  'SG-3 the same suggestion again returns the pending row');
select throws_ok(
  $$ select suggest_firm_for_registration(
       '00000000-0000-4000-e800-0000000000d1', '00000000-0000-4000-e800-0000000000b2',
       'A different firm while one suggestion is still open.') $$,
  '22023', 'a suggestion is already pending',
  'SG-4 a second firm cannot replace a pending suggestion');

reset role;
select is(
  (select organization_id from registrations where id = '00000000-0000-4000-e800-0000000000d1'),
  null,
  'SG-5 the application is still unassigned');

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-e800-0000000000a2","role":"authenticated"}', true);
select is(
  (select count(*) from registrations where id = '00000000-0000-4000-e800-0000000000d1'),
  0::bigint,
  'SG-6 the suggested firm cannot read the application');
select throws_ok(
  $$ select count(*) from registration_firm_suggestions $$,
  '42501', null,
  'SG-7 and cannot read the suggestion table');

reset role;
select set_config('request.jwt.claims', '', true);
set local role anon;
select is(
  (select firm_name from my_firm_suggestion('00000000-0000-4000-e800-0000000000e1')),
  'Suggested Firm',
  'SG-8 the applicant sees the firm name and nothing else');
select lives_ok(
  $$ select * from respond_to_firm_suggestion(
       '00000000-0000-4000-e800-0000000000e1', 'decline') $$,
  'SG-9 the applicant declines');
reset role;
select is(
  (select organization_id from registrations where id = '00000000-0000-4000-e800-0000000000d1'),
  null,
  'SG-10 decline still grants the firm nothing');

-- Expiry and a stale row: no assignment.
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-e800-0000000000a1","role":"authenticated"}', true);
select lives_ok(
  $$ select suggest_firm_for_registration(
       '00000000-0000-4000-e800-0000000000d2', '00000000-0000-4000-e800-0000000000b1',
       'Second suggestion, to be expired before the applicant answers.') $$,
  'SG-11 a second application can be suggested');
reset role;
update registration_firm_suggestions set expires_at = now() - interval '1 day'
 where registration_id = '00000000-0000-4000-e800-0000000000d2';
set local role anon;
select set_config('request.jwt.claims', '', true);
select throws_ok(
  $$ select * from respond_to_firm_suggestion(
       '00000000-0000-4000-e800-0000000000e2', 'accept') $$,
  '22023', 'suggestion expired',
  'SG-12 an expired suggestion cannot be accepted');
reset role;
select is(
  (select organization_id from registrations where id = '00000000-0000-4000-e800-0000000000d2'),
  null,
  'SG-13 expiry grants the firm nothing');

select * from finish();
rollback;
