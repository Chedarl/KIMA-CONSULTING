-- An authorized engagement is not revoked. The check binds the table owner,
-- who bypasses engagements_grant_guard, and a signed-in firm. Synthetic; rolled back.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select plan(5);

insert into auth.users (id, email) values
  ('00000000-0000-4000-e300-0000000000a1', 'partner@notrevoked.test');
insert into organizations (id, name) values
  ('00000000-0000-4000-e300-0000000000a0', 'Not-Revoked Firm');
insert into taxpayers (id, legal_name) values
  ('00000000-0000-4000-e300-0000000000b0', 'Not-Revoked Client');
insert into firm_members (id, organization_id, person_label, email, role, auth_user_id) values
  ('00000000-0000-4000-e300-0000000000a2', '00000000-0000-4000-e300-0000000000a0',
   'NotRevoked Partner', 'partner@notrevoked.test', 'firm_partner',
   '00000000-0000-4000-e300-0000000000a1');
insert into engagements (id, organization_id, taxpayer_id, status, authorized_at) values
  ('00000000-0000-4000-e300-0000000000e1', '00000000-0000-4000-e300-0000000000a0',
   '00000000-0000-4000-e300-0000000000b0', 'authorized', now());

select ok(
  exists (
    select 1 from pg_constraint
     where conname = 'engagements_authorized_is_not_revoked'
       and conrelid = 'public.engagements'::regclass
  ),
  'T-320 the authorized-is-not-revoked check exists'
);

-- Table owner bypasses the grant guard. The check is what refuses the row.
select throws_ok(
  $$ insert into engagements (id, organization_id, taxpayer_id, status, authorized_at, revoked_at)
     values ('00000000-0000-4000-e300-0000000000e2',
             '00000000-0000-4000-e300-0000000000a0',
             '00000000-0000-4000-e300-0000000000b0',
             'authorized', now(), now()) $$,
  '23514', 'engagements_authorized_is_not_revoked',
  'T-321 a privileged insert cannot store authorized and revoked together'
);

insert into taxpayers (id, legal_name) values
  ('00000000-0000-4000-e300-0000000000b1', 'Still Authorisable Client');

select lives_ok(
  $$ insert into engagements (id, organization_id, taxpayer_id, status, authorized_at)
     values ('00000000-0000-4000-e300-0000000000e3',
             '00000000-0000-4000-e300-0000000000a0',
             '00000000-0000-4000-e300-0000000000b1',
             'authorized', now()) $$,
  'T-322 control: authorized with revoked_at null is still valid'
);

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-e300-0000000000a1","role":"authenticated"}', true);

select lives_ok(
  $$ update engagements set status = 'revoked', revoked_at = now()
      where id = '00000000-0000-4000-e300-0000000000e1' $$,
  'T-323 control: the firm may still revoke'
);

select throws_ok(
  $$ update engagements set status = 'authorized'
      where id = '00000000-0000-4000-e300-0000000000e1' $$,
  '23514', 'engagements_authorized_is_not_revoked',
  'T-324 the firm cannot label a revoked engagement authorized'
);

select * from finish();
rollback;
