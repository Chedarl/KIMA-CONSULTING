-- T-320 .. T-326: a revoked engagement stays revoked (20261101010000, R-59 defect c).
--
-- The hole, reproduced against a replay WITHOUT the migration: revoking an
-- engagement sets status = 'revoked' and revoked_at together, but the guard
-- only refused to CLEAR revoked_at afterwards. Nothing stopped a later update
-- flipping status back to 'authorized' while revoked_at stayed set -- a row
-- that grants nothing (every access check filters revoked_at) yet reads as
-- authorised to any screen that trusts the status word. Without the
-- migration, T-321, T-322 and T-324 raise nothing and T-326 finds the
-- contradictory row; T-323 and T-325 also pass silently, one as a plain
-- update, one as a rewrite of when the revocation happened.
--
-- Two layers are under test, because this repo keeps them separate on
-- purpose: the CHECK binds every writer including the service role the guard
-- exempts (T-321 .. T-323 run privileged), and the guard gives the API caller
-- the refusal with the reason in it (T-324, T-325 run as a firm partner).
-- T-320 is the control: a legitimate revocation, both columns in one
-- statement, still works.
--
-- Synthetic data only; the whole file rolls back.

begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(7);

-- ---------------------------------------------------------------------------
-- Fixture. One firm, one partner bound to an auth user, two taxpayers with an
-- authorised engagement each, written privileged the way the other suites
-- write theirs. e1 is the one T-320 revokes; e2 stays live for T-323.
-- ---------------------------------------------------------------------------
insert into auth.users (id, email) values
  ('00000000-0000-4000-d000-0000000000a1', 'partner-a@revoke-final.test');

insert into organizations (id, name) values
  ('00000000-0000-4000-d000-0000000000a0', 'Revoke Final Firm A');

insert into firm_members (id, organization_id, person_label, email, role, auth_user_id) values
  ('00000000-0000-4000-d000-0000000000a2', '00000000-0000-4000-d000-0000000000a0',
   'Revoke Partner A', 'partner-a@revoke-final.test', 'firm_partner',
   '00000000-0000-4000-d000-0000000000a1');

insert into taxpayers (id, legal_name) values
  ('00000000-0000-4000-d000-00000000000a', 'Taxpayer of Revoke Final Firm A'),
  ('00000000-0000-4000-d000-00000000000b', 'Second taxpayer of Revoke Final Firm A');

insert into engagements (id, organization_id, taxpayer_id, status, authorized_at) values
  ('00000000-0000-4000-d000-0000000000e1', '00000000-0000-4000-d000-0000000000a0',
   '00000000-0000-4000-d000-00000000000a', 'authorized', now()),
  ('00000000-0000-4000-d000-0000000000e2', '00000000-0000-4000-d000-0000000000a0',
   '00000000-0000-4000-d000-00000000000b', 'authorized', now());

-- ---------------------------------------------------------------------------
-- As Partner A, through the API path: RLS applies, the guard sees the role.
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-d000-0000000000a1","role":"authenticated"}', true);

select lives_ok(
  $$ update engagements set status = 'revoked', revoked_at = now()
      where id = '00000000-0000-4000-d000-0000000000e1' $$,
  'T-320 control: the firm revokes its own engagement, both columns together'
);

select throws_ok(
  $$ update engagements set status = 'authorized'
      where id = '00000000-0000-4000-d000-0000000000e1' $$,
  '42501', null,
  'T-324 a revoked engagement cannot be flipped back to authorized by an API caller'
);

select throws_ok(
  $$ update engagements set revoked_at = revoked_at + interval '1 day'
      where id = '00000000-0000-4000-d000-0000000000e1' $$,
  '42501', null,
  'T-325 and even the revocation date cannot be rewritten afterwards'
);

reset role;

-- ---------------------------------------------------------------------------
-- Privileged writes, where the guard steps aside: the CHECK is the whole
-- defence, which is why it exists. This is the owner's defect, closed at row
-- level for migrations, seeds and the service role too.
-- ---------------------------------------------------------------------------
select throws_ok(
  $$ update engagements set status = 'authorized'
      where id = '00000000-0000-4000-d000-0000000000e1' $$,
  '23514', null,
  'T-321 no writer can make a revoked row read authorized (the defect itself)'
);

select throws_ok(
  $$ insert into engagements (id, organization_id, taxpayer_id, status, authorized_at, revoked_at)
     values ('00000000-0000-4000-d000-0000000000e3',
             '00000000-0000-4000-d000-0000000000a0',
             '00000000-0000-4000-d000-00000000000b', 'authorized', now(), now()) $$,
  '23514', null,
  'T-322 and no writer can insert the contradiction directly'
);

select throws_ok(
  $$ update engagements set revoked_at = now()
      where id = '00000000-0000-4000-d000-0000000000e2' $$,
  '23514', null,
  'T-323 revoked_at without the status word is refused as well (the old T-49 fixture shape)'
);

select is(
  (select count(*) from engagements
     where revoked_at is not null and status <> 'revoked'),
  0::bigint,
  'T-326 invariant: no engagement reads one thing and dates another'
);

select * from finish();
rollback;
