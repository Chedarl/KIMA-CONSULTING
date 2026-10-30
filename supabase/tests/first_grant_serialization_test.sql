-- R-56 race regression: a firm-only first grant must take a taxpayer lock
-- before checking whether any other firm has previously been granted access.
-- These are same-session controls; scripts/test-two-session-first-grant.sh
-- exercises the actual two-connection interleaving in CI.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select plan(3);

insert into auth.users (id, email) values
 ('00000000-0000-4000-c000-00000000d0a1', 'race-a@example.test'),
 ('00000000-0000-4000-c000-00000000d0b1', 'race-b@example.test');
insert into organizations (id, name) values
 ('00000000-0000-4000-c000-00000000d0a0', 'Race Firm A'),
 ('00000000-0000-4000-c000-00000000d0b0', 'Race Firm B');
insert into taxpayers (id, legal_name) values
 ('00000000-0000-4000-c000-00000000d0ff', 'Shared Prospect');
insert into firm_members (id, organization_id, person_label, email, role, auth_user_id) values
 ('00000000-0000-4000-c000-00000000d0a2',
  '00000000-0000-4000-c000-00000000d0a0', 'Partner A',
  'race-a@example.test', 'firm_partner', '00000000-0000-4000-c000-00000000d0a1'),
 ('00000000-0000-4000-c000-00000000d0b2',
  '00000000-0000-4000-c000-00000000d0b0', 'Partner B',
  'race-b@example.test', 'firm_partner', '00000000-0000-4000-c000-00000000d0b1');
insert into engagements (id, organization_id, taxpayer_id, status) values
 ('00000000-0000-4000-c000-00000000d0a3',
  '00000000-0000-4000-c000-00000000d0a0',
  '00000000-0000-4000-c000-00000000d0ff', 'draft'),
 ('00000000-0000-4000-c000-00000000d0b3',
  '00000000-0000-4000-c000-00000000d0b0',
  '00000000-0000-4000-c000-00000000d0ff', 'draft');

set local role authenticated;
select set_config('request.jwt.claims',
 '{"sub":"00000000-0000-4000-c000-00000000d0a1","role":"authenticated"}', true);
update engagements set status='authorized', authorized_at=now()
 where id='00000000-0000-4000-c000-00000000d0a3';

select ok(
 (select count(*) from pg_catalog.pg_locks
   where pid=pg_backend_pid() and locktype='advisory' and granted) > 0,
 'R-56 first unilateral grant holds a transaction-level advisory lock'
);

select is(
 (select count(*) from engagements
   where id='00000000-0000-4000-c000-00000000d0a3'
     and status='authorized'), 1::bigint,
 'R-56 first firm can still authorize an otherwise unheld prospect'
);

select set_config('request.jwt.claims',
 '{"sub":"00000000-0000-4000-c000-00000000d0b1","role":"authenticated"}', true);
select throws_ok(
 $$ update engagements set status='authorized', authorized_at=now()
     where id='00000000-0000-4000-c000-00000000d0b3' $$,
 '42501', null, 'R-56 second firm cannot unilaterally authorize after first grant'
);

reset role;
select * from finish();
rollback;
