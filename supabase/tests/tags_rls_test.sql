-- public.tags must be scoped to a firm member's own organisation. Before the
-- fix the demo `using (true)` / `with check (true)` policies let any role read
-- every firm's tags and insert into any firm. Synthetic; rolled back.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select plan(3);

insert into auth.users (id, email) values
  ('00000000-0000-4000-e300-0000000000d1', 'member-a@tags.test'),
  ('00000000-0000-4000-e300-0000000000d2', 'member-b@tags.test');
insert into organizations (id, name) values
  ('00000000-0000-4000-e300-0000000000d0', 'Tags Firm A'),
  ('00000000-0000-4000-e300-0000000000d5', 'Tags Firm B');
insert into firm_members (id, organization_id, person_label, email, role, auth_user_id) values
  ('00000000-0000-4000-e300-0000000000d3', '00000000-0000-4000-e300-0000000000d0',
   'Member A', 'member-a@tags.test', 'firm_partner', '00000000-0000-4000-e300-0000000000d1'),
  ('00000000-0000-4000-e300-0000000000d4', '00000000-0000-4000-e300-0000000000d5',
   'Member B', 'member-b@tags.test', 'firm_partner', '00000000-0000-4000-e300-0000000000d2');
insert into tags (id, organization_id, label) values
  ('00000000-0000-4000-e300-0000000000d6', '00000000-0000-4000-e300-0000000000d0', 'VIP A'),
  ('00000000-0000-4000-e300-0000000000d7', '00000000-0000-4000-e300-0000000000d5', 'VIP B');

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-e300-0000000000d1","role":"authenticated"}', true);

select is(
  (select count(*) from tags),
  1::bigint,
  'T-328 a firm member reads only their own firm tags'
);

select throws_ok(
  $$ insert into tags (organization_id, label)
     values ('00000000-0000-4000-e300-0000000000d5', 'leak') $$,
  '42501', null,
  'T-329 a firm member cannot write a tag into another firm'
);

select set_config('request.jwt.claims', '', true);
set local role anon;

select is(
  (select count(*) from tags),
  0::bigint,
  'T-330 anon reads no tags'
);

select * from finish();
rollback;
