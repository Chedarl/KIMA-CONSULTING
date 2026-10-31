-- R-57 / OD-7: legacy identity helpers must also honor firm suspension.
-- Fail-first controls for private.firm_member_has/current_member_id/label.
-- Fixtures are synthetic; each transaction rolls back.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select plan(11);

insert into auth.users (id, email) values
  ('00000000-0000-4000-c000-00000000f001', 'suspend-j@example.test'),
  ('00000000-0000-4000-c000-00000000f002', 'suspend-k@example.test');

insert into organizations (id, name, kind, registration_number) values
  ('00000000-0000-4000-c000-00000000f010', 'Suspend Test Firm J', 'firm', 'SUSPEND-J'),
  ('00000000-0000-4000-c000-00000000f011', 'Suspend Test Firm K', 'firm', 'SUSPEND-K');

insert into firm_members (id, organization_id, person_label, email, role, auth_user_id) values
  ('00000000-0000-4000-c000-00000000f030', '00000000-0000-4000-c000-00000000f010',
   'Synthetic Partner J', 'suspend-j@example.test', 'firm_partner',
   '00000000-0000-4000-c000-00000000f001'),
  ('00000000-0000-4000-c000-00000000f031', '00000000-0000-4000-c000-00000000f011',
   'Synthetic Partner K', 'suspend-k@example.test', 'firm_partner',
   '00000000-0000-4000-c000-00000000f002');

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-c000-00000000f001","role":"authenticated"}', true);

select ok(private.firm_member_has('case.view'),
  'T-178 J has a capability before suspension');
select is(private.current_member_id(),
  '00000000-0000-4000-c000-00000000f030'::uuid,
  'T-179 J has an identity before suspension');
select is(private.current_member_label(), 'Synthetic Partner J',
  'T-180 J has a label before suspension');

reset role;
update organizations set suspended_at = now()
 where id = '00000000-0000-4000-c000-00000000f010';

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-c000-00000000f001","role":"authenticated"}', true);

select is(private.firm_member_has('case.view'), false,
  'T-181 suspended J loses remaining capability helper');
select is(private.current_member_id(), null::uuid,
  'T-182 suspended J has no member identity');
select is(private.current_member_label(), null::text,
  'T-183 suspended J has no member label');
reset role;

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-c000-00000000f002","role":"authenticated"}', true);
select ok(private.firm_member_has('case.view'),
  'T-184 unrelated firm K still has its capability');
select is(private.current_member_id(),
  '00000000-0000-4000-c000-00000000f031'::uuid,
  'T-185 unrelated firm K retains its identity');
reset role;

update organizations set suspended_at = null
 where id = '00000000-0000-4000-c000-00000000f010';

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-c000-00000000f001","role":"authenticated"}', true);
select ok(private.firm_member_has('case.view'),
  'T-186 resumed J regains the capability');
select is(private.current_member_id(),
  '00000000-0000-4000-c000-00000000f030'::uuid,
  'T-187 resumed J regains its own identity');
select is(private.current_member_label(), 'Synthetic Partner J',
  'T-188 resumed J regains its own label');
reset role;

select * from finish();
rollback;
