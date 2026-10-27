-- P0 negative tests T-01 .. T-04: storage objects are reached through the
-- taxpayer segment of their path, under can_see_taxpayer().
-- Run with `supabase test db` (pgTAP). Synthetic data only; rolled back.

begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(7);

-- ---------------------------------------------------------------------------
-- Fixture: one firm, taxpayers A and B, one client per taxpayer, one reviewer.
-- ---------------------------------------------------------------------------
insert into auth.users (id, email) values
  ('00000000-0000-4000-a000-0000000001aa', 'client-a@example.test'),
  ('00000000-0000-4000-a000-0000000001bb', 'client-b@example.test'),
  ('00000000-0000-4000-a000-0000000001ff', 'reviewer@example.test');
insert into organizations (id, name) values ('00000000-0000-4000-a000-0000000000f0', 'Test firm');
insert into taxpayers (id, legal_name) values
  ('00000000-0000-4000-a000-00000000000a', 'Taxpayer A'),
  ('00000000-0000-4000-a000-00000000000b', 'Taxpayer B');
insert into contacts (id, organization_id, full_name, email, auth_user_id) values
  ('00000000-0000-4000-a000-0000000000ca', '00000000-0000-4000-a000-0000000000f0', 'Client A', 'client-a@example.test', '00000000-0000-4000-a000-0000000001aa'),
  ('00000000-0000-4000-a000-0000000000cb', '00000000-0000-4000-a000-0000000000f0', 'Client B', 'client-b@example.test', '00000000-0000-4000-a000-0000000001bb');
insert into contact_account_links (contact_id, taxpayer_id, portal_access) values
  ('00000000-0000-4000-a000-0000000000ca', '00000000-0000-4000-a000-00000000000a', true),
  ('00000000-0000-4000-a000-0000000000cb', '00000000-0000-4000-a000-00000000000b', true);
insert into firm_members (id, organization_id, person_label, email, role, auth_user_id) values
  ('00000000-0000-4000-a000-0000000000ff', '00000000-0000-4000-a000-0000000000f0', 'Test Reviewer', 'reviewer@example.test', 'firm_reviewer', '00000000-0000-4000-a000-0000000001ff');

update app_flags set enabled = false where key = 'allow_demo_anon';

insert into storage.objects (bucket_id, name) values
  ('kima-demo', '00000000-0000-4000-a000-00000000000a/r/a.pdf'),
  ('kima-demo', '00000000-0000-4000-a000-00000000000b/r/b.pdf');

-- T-01 Anon lists the bucket with the demo flag off.
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select is(
  (select count(*)::int from storage.objects where bucket_id = 'kima-demo'),
  0,
  'T-01 anon lists nothing in kima-demo with the demo flag off'
);
reset role;

-- T-02 / T-03 Client A: own path allowed, B's path refused both ways.
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-a000-0000000001aa","role":"authenticated"}', true);

select lives_ok(
  $$ insert into storage.objects (bucket_id, name)
     values ('kima-demo', '00000000-0000-4000-a000-00000000000a/r/new.pdf') $$,
  'T-02 client A uploads under A/'
);
select throws_ok(
  $$ insert into storage.objects (bucket_id, name)
     values ('kima-demo', '00000000-0000-4000-a000-00000000000b/r/evil.pdf') $$,
  '42501', null,
  'T-03 client A cannot upload under B/'
);
select throws_ok(
  $$ insert into storage.objects (bucket_id, name)
     values ('kima-demo', 'no-taxpayer/evil.pdf') $$,
  '42501', null,
  'T-03 client A cannot upload to a path with no taxpayer segment'
);
select is(
  (select count(*)::int from storage.objects
   where bucket_id = 'kima-demo' and name like '00000000-0000-4000-a000-00000000000b/%'),
  0,
  'T-03 client A cannot read objects under B/'
);
select is(
  (select count(*)::int from storage.objects
   where bucket_id = 'kima-demo' and name like '00000000-0000-4000-a000-00000000000a/%'),
  2,
  'T-02 client A reads its own objects'
);
reset role;

-- T-04 The firm reviewer reads an object under a taxpayer it can see.
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-a000-0000000001ff","role":"authenticated"}', true);
select is(
  (select count(*)::int from storage.objects
   where bucket_id = 'kima-demo' and name = '00000000-0000-4000-a000-00000000000b/r/b.pdf'),
  1,
  'T-04 firm reviewer reads an object under taxpayer B'
);
reset role;

select * from finish();
rollback;
