-- T-348 .. T-354: the firm-logo storage policies reach the logo folder, and
-- nothing else.
--
-- 20261103190000 introduced three policies keyed on the SECOND path segment
-- alone. Because RLS policies for one command are OR'ed, that became a second
-- route into the shared `kima-demo` bucket with the FIRST segment -- the
-- taxpayer's id, per storage_path_taxpayer() -- left to the caller's choice. A
-- firm member holding no engagement on a taxpayer could write into that
-- taxpayer's folder, and the firm that did hold the engagement would then list
-- the planted object among its own client's files.
--
-- T-350 is the assertion that fails without 20261104090000. The rest pin the
-- behaviour the logo feature actually needs, so the anchor cannot be dropped
-- again to "make uploads work".
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(7);

-- ---------------------------------------------------------------------------
-- Two unrelated firms. The victim firm holds the only engagement on the victim
-- taxpayer; the attacking firm holds none, which is the whole point.
-- ---------------------------------------------------------------------------
insert into auth.users (id, email) values
  ('00000000-0000-4000-b100-0000000000a1', 'logo-attacker@example.test'),
  ('00000000-0000-4000-b100-0000000000a2', 'logo-victim@example.test');
insert into organizations (id, name, kind) values
  ('00000000-0000-4000-b100-0000000000b1', 'Logo Attacker Firm', 'firm'),
  ('00000000-0000-4000-b100-0000000000b2', 'Logo Victim Firm', 'firm');
insert into firm_members (id, organization_id, person_label, email, role, auth_user_id, active) values
  ('00000000-0000-4000-b100-0000000000c1', '00000000-0000-4000-b100-0000000000b1',
   'Attacker Partner', 'logo-attacker@example.test', 'firm_partner',
   '00000000-0000-4000-b100-0000000000a1', true),
  ('00000000-0000-4000-b100-0000000000c2', '00000000-0000-4000-b100-0000000000b2',
   'Victim Partner', 'logo-victim@example.test', 'firm_partner',
   '00000000-0000-4000-b100-0000000000a2', true);
insert into taxpayers (id, legal_name) values
  ('00000000-0000-4000-b100-0000000000d2', 'Logo Victim Client SA');
insert into engagements (organization_id, taxpayer_id, status, authorized_at) values
  ('00000000-0000-4000-b100-0000000000b2', '00000000-0000-4000-b100-0000000000d2',
   'authorized', now());
insert into storage.buckets (id, name) values ('kima-demo', 'kima-demo')
  on conflict do nothing;

update app_flags set enabled = false where key = 'allow_demo_anon';

-- ---------------------------------------------------------------------------
-- The attacking firm's member.
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-b100-0000000000a1","role":"authenticated"}', true);

-- T-348 control: the member can put its own logo in its own folder.
select lives_ok($$insert into storage.objects (bucket_id, name) values
  ('kima-demo', 'branding/00000000-0000-4000-b100-0000000000c1/logo.svg')$$,
  'T-348 a firm member uploads its logo under branding/{its own member id}');

-- T-349 another member's logo folder is not writable.
select throws_ok($$insert into storage.objects (bucket_id, name) values
  ('kima-demo', 'branding/00000000-0000-4000-b100-0000000000c2/logo.svg')$$,
  '42501', null,
  'T-349 and not under another member''s branding folder');

-- T-350 THE REGRESSION. The second segment is the attacker's own member id, so
-- the unanchored policy accepted this; the first segment is a taxpayer the
-- attacking firm has no engagement on.
select throws_ok($$insert into storage.objects (bucket_id, name) values
  ('kima-demo',
   '00000000-0000-4000-b100-0000000000d2/00000000-0000-4000-b100-0000000000c1/planted.pdf')$$,
  '42501', null,
  'T-350 a firm member cannot plant a file in an unengaged taxpayer''s folder');

-- T-351 the same refusal with the segments in any other arrangement: it is the
-- `branding` anchor doing the work, not the shape of the uuid.
select throws_ok($$insert into storage.objects (bucket_id, name) values
  ('kima-demo', 'evidence/00000000-0000-4000-b100-0000000000c1/anywhere.pdf')$$,
  '42501', null,
  'T-351 nor anywhere else that merely carries its member id second');

-- T-352 a rename cannot walk the object out of the logo folder. Postgres reuses
-- USING as the check when WITH CHECK is absent, so this held before too; it is
-- pinned because the fix states both halves and a later edit could drop one.
select throws_ok($$update storage.objects
     set name = '00000000-0000-4000-b100-0000000000d2/00000000-0000-4000-b100-0000000000c1/moved.pdf'
   where name = 'branding/00000000-0000-4000-b100-0000000000c1/logo.svg'$$,
  '42501', null,
  'T-352 nor rename its logo into a taxpayer folder');

-- T-353 the firm can delete its own logo, so a replacement is possible. There
-- was no DELETE policy before 20261104090000.
select lives_ok($$delete from storage.objects
   where name = 'branding/00000000-0000-4000-b100-0000000000c1/logo.svg'$$,
  'T-353 a firm member deletes its own logo so it can be replaced');

-- ---------------------------------------------------------------------------
-- T-354 the victim firm's view is unchanged: it sees its own client's files and
-- no planted object. Asserted as a count so the test states the isolation, not
-- just the refusal above.
-- ---------------------------------------------------------------------------
reset role;
insert into storage.objects (bucket_id, name) values
  ('kima-demo', '00000000-0000-4000-b100-0000000000d2/r/real-client-file.pdf');

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-b100-0000000000a2","role":"authenticated"}', true);
select is(
  (select coalesce(string_agg(split_part(name, '/', 3), ', ' order by name), '(nothing)')
     from storage.objects
    where bucket_id = 'kima-demo'
      and storage_path_taxpayer(name) = '00000000-0000-4000-b100-0000000000d2'),
  'real-client-file.pdf',
  'T-354 the engaged firm sees its client''s own file and nothing planted');

reset role;
select * from finish();
rollback;
