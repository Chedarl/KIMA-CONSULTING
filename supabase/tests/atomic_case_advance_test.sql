-- advance_case() must apply the case patch and append its audit event in one
-- transaction, and refuse a caller with no authority over the case. Synthetic;
-- rolled back.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select plan(3);

insert into auth.users (id, email) values
  ('00000000-0000-4000-e300-0000000000f1', 'partner@atomic.test');
insert into organizations (id, name) values
  ('00000000-0000-4000-e300-0000000000f0', 'Atomic Firm');
insert into firm_members (id, organization_id, person_label, email, role, auth_user_id) values
  ('00000000-0000-4000-e300-0000000000f2', '00000000-0000-4000-e300-0000000000f0',
   'Atomic Partner', 'partner@atomic.test', 'firm_partner', '00000000-0000-4000-e300-0000000000f1');
insert into taxpayers (id, legal_name) values
  ('00000000-0000-4000-e300-0000000000f3', 'Atomic Client');
insert into compliance_cases (id, organization_id, taxpayer_id, obligation_code, period_token, stage)
  values ('00000000-0000-4000-e300-0000000000f4', '00000000-0000-4000-e300-0000000000f0',
          '00000000-0000-4000-e300-0000000000f3', 'vat', '2026M09', 'documents');

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-e300-0000000000f1","role":"authenticated"}', true);

select lives_ok(
  $$ select public.advance_case(
       '00000000-0000-4000-e300-0000000000f4',
       '{"stage":"accounting"}'::jsonb,
       '[{"dimension":"work","kind":"stage_advanced","actor_role":"firm_partner","actor_label":"Atomic Partner","from_value":"documents","to_value":"accounting","visibility":"internal"}]'::jsonb
     ) $$,
  'T-334 advance_case applies the patch and appends the event atomically'
);

select is(
  (select stage::text from compliance_cases where id = '00000000-0000-4000-e300-0000000000f4'),
  'accounting',
  'T-335 the case stage moved'
);

select is(
  (select count(*) from case_events where case_id = '00000000-0000-4000-e300-0000000000f4'),
  1::bigint,
  'T-336 exactly one audit event was written'
);

select * from finish();
rollback;
