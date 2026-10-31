-- A client acceptance date is now(), not a value from the browser.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select plan(3);

insert into auth.users (id, email) values
  ('00000000-0000-4000-e500-0000000000a1', 'stamp-partner@example.test'),
  ('00000000-0000-4000-e500-0000000000c1', 'stamp-client@example.test');
insert into organizations (id, name) values
  ('00000000-0000-4000-e500-0000000000a0', 'Stamp Firm');
insert into taxpayers (id, legal_name) values
  ('00000000-0000-4000-e500-0000000000b0', 'Stamp Client SARL');
insert into firm_members (id, organization_id, person_label, email, role, auth_user_id) values
  ('00000000-0000-4000-e500-0000000000a2', '00000000-0000-4000-e500-0000000000a0',
   'Stamp Partner', 'stamp-partner@example.test', 'firm_partner',
   '00000000-0000-4000-e500-0000000000a1');
insert into engagements (id, organization_id, taxpayer_id, status) values
  ('00000000-0000-4000-e500-0000000000e1', '00000000-0000-4000-e500-0000000000a0',
   '00000000-0000-4000-e500-0000000000b0', 'draft');
insert into contacts (id, organization_id, full_name, email, auth_user_id) values
  ('00000000-0000-4000-e500-0000000000c2', '00000000-0000-4000-e500-0000000000a0',
   'Stamp Client', 'stamp-client@example.test', '00000000-0000-4000-e500-0000000000c1');
insert into contact_account_links (contact_id, taxpayer_id, relationship, portal_access) values
  ('00000000-0000-4000-e500-0000000000c2', '00000000-0000-4000-e500-0000000000b0', 'owner', true);

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-e500-0000000000c1","role":"authenticated"}', true);
select lives_ok(
  $$ update engagements set status = 'accepted', accepted_at = '2000-01-01'
      where id = '00000000-0000-4000-e500-0000000000e1'
        and status = 'draft' and accepted_at is null $$,
  'T-360 the client accepts a draft without choosing the clock'
);
select ok(
  (select accepted_at > now() - interval '5 minutes'
          and accepted_at <> '2000-01-01'
     from engagements where id = '00000000-0000-4000-e500-0000000000e1'),
  'T-361 accepted_at is the database clock, not the supplied date'
);
reset role;

insert into engagements (id, organization_id, taxpayer_id, status) values
  ('00000000-0000-4000-e500-0000000000e2', '00000000-0000-4000-e500-0000000000a0',
   '00000000-0000-4000-e500-0000000000b0', 'draft');
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-e500-0000000000a1","role":"authenticated"}', true);
select throws_ok(
  $$ update engagements set status = 'accepted'
      where id = '00000000-0000-4000-e500-0000000000e2' $$,
  '23514', null,
  'T-362 a firm does not receive a stamped acceptance'
);

select * from finish();
rollback;
