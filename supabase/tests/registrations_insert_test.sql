-- An anonymous applicant may submit only the applicant fields of a
-- registration. The lifecycle columns -- status, decided_at, decided_by,
-- decision_note, taxpayer_id -- are not grantable, so a stranger cannot
-- self-approve or attach an application to a taxpayer. Synthetic; rolled back.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select plan(3);

set local role anon;
select set_config('request.jwt.claims', '', true);

select lives_ok(
  $$ insert into registrations (applicant_name, taxpayer_type)
     values ('Applicant', 'business_moral') $$,
  'T-331 anon may submit an application with only the applicant fields'
);

select throws_ok(
  $$ insert into registrations (applicant_name, taxpayer_type, status)
     values ('Forgery', 'business_moral', 'approved') $$,
  '42501', null,
  'T-332 anon cannot write status (no self-approval)'
);

select throws_ok(
  $$ insert into registrations (applicant_name, taxpayer_type, taxpayer_id, decided_by, decided_at)
     values ('Forgery', 'business_moral', '00000000-0000-4000-e300-0000000000b0', 'attacker', now()) $$,
  '42501', null,
  'T-333 anon cannot write taxpayer_id or the decision columns'
);

select * from finish();
rollback;
