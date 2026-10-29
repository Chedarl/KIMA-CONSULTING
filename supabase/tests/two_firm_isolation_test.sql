-- T-22 .. T-35: two firms, two taxpayers. A member of one firm must never read
-- or write the other firm's records, down to the stored file.
--
-- These failed before 20261029213000 and gate the build now. The commit that
-- added them wrapped six in pgTAP TODO blocks, because can_see_taxpayer(tp)
-- began with member_has('case.view') — a check that was never passed the
-- taxpayer or an organisation, and so was true for every taxpayer and every
-- active firm member. That migration added the missing dimension, the TODO
-- wrappers came off, and a regression here is now a red build.
--
-- Reads and writes are both covered on purpose. Fixing only the read path
-- would have turned the read tests green while a member of one firm could
-- still update another firm's taxpayers.
--
-- The controls (T-22, T-27, T-32, T-35) must pass before and after any further
-- change: each firm keeps full access to the taxpayer it actually holds an
-- engagement for, so a policy that simply refuses everything cannot pass here.
--
-- Run with `supabase test db` (pgTAP). Synthetic data only; rolled back.

begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(15);

-- ---------------------------------------------------------------------------
-- Fixture: two unrelated firms, each with one taxpayer, one engagement and one
-- reviewer. Nothing links firm A to taxpayer B.
-- ---------------------------------------------------------------------------
insert into auth.users (id, email) values
  ('00000000-0000-4000-a000-00000000a003', 'reviewer-a@example.test'),
  ('00000000-0000-4000-a000-00000000b003', 'reviewer-b@example.test'),
  ('00000000-0000-4000-a000-0000000c0003', 'orphan@example.test');

insert into organizations (id, name) values
  ('00000000-0000-4000-a000-00000000a001', 'Firm A'),
  ('00000000-0000-4000-a000-00000000b001', 'Firm B');

insert into taxpayers (id, legal_name) values
  ('00000000-0000-4000-a000-00000000a002', 'Taxpayer of Firm A'),
  ('00000000-0000-4000-a000-00000000b002', 'Taxpayer of Firm B');

-- The authorised grant, one per firm. This is what carries access.
insert into engagements (organization_id, taxpayer_id) values
  ('00000000-0000-4000-a000-00000000a001', '00000000-0000-4000-a000-00000000a002'),
  ('00000000-0000-4000-a000-00000000b001', '00000000-0000-4000-a000-00000000b002');

insert into firm_members (id, organization_id, person_label, email, role, auth_user_id) values
  ('00000000-0000-4000-a000-00000000a004', '00000000-0000-4000-a000-00000000a001',
   'Reviewer A', 'reviewer-a@example.test', 'firm_reviewer', '00000000-0000-4000-a000-00000000a003'),
  ('00000000-0000-4000-a000-00000000b004', '00000000-0000-4000-a000-00000000b001',
   'Reviewer B', 'reviewer-b@example.test', 'firm_reviewer', '00000000-0000-4000-a000-00000000b003');

-- A member belonging to no organisation. Earlier migrations seed rows in this
-- shape, so the state is reachable and has to be safe rather than merely
-- forbidden. See T-36.
insert into firm_members (id, organization_id, person_label, email, role, auth_user_id) values
  ('00000000-0000-4000-a000-0000000c0004', null,
   'Orphan Member', 'orphan@example.test', 'firm_partner', '00000000-0000-4000-a000-0000000c0003');

insert into compliance_cases (id, organization_id, taxpayer_id, obligation_code, period_token) values
  ('00000000-0000-4000-a000-00000000a005', '00000000-0000-4000-a000-00000000a001',
   '00000000-0000-4000-a000-00000000a002', 'patente', '2026A'),
  ('00000000-0000-4000-a000-00000000b005', '00000000-0000-4000-a000-00000000b001',
   '00000000-0000-4000-a000-00000000b002', 'patente', '2026A');

insert into document_requests (id, taxpayer_id, organization_id, label_fr, label_en, due_on) values
  ('00000000-0000-4000-a000-00000000a006', '00000000-0000-4000-a000-00000000a002',
   '00000000-0000-4000-a000-00000000a001', 'Relevé A', 'Statement A', '2026-03-15'),
  ('00000000-0000-4000-a000-00000000b006', '00000000-0000-4000-a000-00000000b002',
   '00000000-0000-4000-a000-00000000b001', 'Relevé B', 'Statement B', '2026-03-15');

-- A reviewed document and the file behind it, one per firm. These are the
-- records a leak would actually hurt: the client's own paperwork.
insert into documents (id, taxpayer_id, file_name, storage_path) values
  ('00000000-0000-4000-a000-00000000a007', '00000000-0000-4000-a000-00000000a002',
   'statement-a.pdf', '00000000-0000-4000-a000-00000000a002/r/statement-a.pdf'),
  ('00000000-0000-4000-a000-00000000b007', '00000000-0000-4000-a000-00000000b002',
   'statement-b.pdf', '00000000-0000-4000-a000-00000000b002/r/statement-b.pdf');

-- Stored files are reached through the taxpayer segment of their path.
insert into storage.objects (bucket_id, name) values
  ('kima-demo', '00000000-0000-4000-a000-00000000a002/r/statement-a.pdf'),
  ('kima-demo', '00000000-0000-4000-a000-00000000b002/r/statement-b.pdf');

-- The anonymous demo branch of can_see_taxpayer() is irrelevant to a signed-in
-- firm member, but switch it off so nothing here depends on it either way.
update app_flags set enabled = false where key = 'allow_demo_anon';

-- ---------------------------------------------------------------------------
-- As Reviewer A (Firm A)
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-a000-00000000a003","role":"authenticated"}', true);

-- T-22 control: Firm A still sees the taxpayer it is engaged for.
select is(
  (select count(*) from taxpayers where id = '00000000-0000-4000-a000-00000000a002'),
  1::bigint,
  'T-22 Firm A reads its own taxpayer'
);

-- T-23
select is(
  (select count(*) from taxpayers where id = '00000000-0000-4000-a000-00000000b002'),
  0::bigint,
  'T-23 Firm A cannot read Firm B''s taxpayer'
);

-- T-24
select is(
  (select count(*) from compliance_cases where id = '00000000-0000-4000-a000-00000000b005'),
  0::bigint,
  'T-24 Firm A cannot read Firm B''s compliance case'
);

-- T-25
select is(
  (select count(*) from document_requests where id = '00000000-0000-4000-a000-00000000b006'),
  0::bigint,
  'T-25 Firm A cannot read Firm B''s document request'
);

-- T-26 the helper itself, so the cause is named and not only its effects.
select ok(
  not can_see_taxpayer('00000000-0000-4000-a000-00000000b002'),
  'T-26 can_see_taxpayer() refuses a taxpayer of another firm'
);

-- T-33 the document row itself.
select is(
  (select count(*) from documents where id = '00000000-0000-4000-a000-00000000b007'),
  0::bigint,
  'T-33 Firm A cannot read Firm B''s document'
);

-- T-34 the stored file behind it.
select is(
  (select count(*) from storage.objects
    where name = '00000000-0000-4000-a000-00000000b002/r/statement-b.pdf'),
  0::bigint,
  'T-34 Firm A cannot read Firm B''s stored file'
);

-- T-35 control: its own client's file is still reachable, so T-34 is scoping
-- and not the storage policy refusing everyone.
select is(
  (select count(*) from storage.objects
    where name = '00000000-0000-4000-a000-00000000a002/r/statement-a.pdf'),
  1::bigint,
  'T-35 control: Firm A reads its own client''s stored file'
);

-- T-31 an INSERT carrying another firm's taxpayer is refused outright.
select throws_ok(
  $$ insert into document_requests (taxpayer_id, organization_id, label_fr, label_en, due_on)
     values ('00000000-0000-4000-a000-00000000b002',
             '00000000-0000-4000-a000-00000000a001',
             'Injecté', 'Injected', '2026-03-15') $$,
  '42501', null,
  'T-31 Firm A cannot raise a request against Firm B''s taxpayer'
);

-- T-32 control: the same write succeeds for its own taxpayer, so the refusals
-- above are scoping and not a blanket denial.
select lives_ok(
  $$ insert into document_requests (taxpayer_id, organization_id, label_fr, label_en, due_on)
     values ('00000000-0000-4000-a000-00000000a002',
             '00000000-0000-4000-a000-00000000a001',
             'Autorisé', 'Allowed', '2026-03-15') $$,
  'T-32 control: Firm A raises a request against its own taxpayer'
);

-- T-30 the write path. A denied UPDATE changes no rows rather than raising, so
-- the attempt is made here and checked below, once the role no longer filters
-- the row out of the read.
update taxpayers set legal_name = 'Renamed by the wrong firm'
 where id = '00000000-0000-4000-a000-00000000b002';

reset role;

select is(
  (select legal_name from taxpayers where id = '00000000-0000-4000-a000-00000000b002'),
  'Taxpayer of Firm B',
  'T-30 Firm A cannot update Firm B''s taxpayer'
);

-- ---------------------------------------------------------------------------
-- As Reviewer B (Firm B) — the same checks from the other side, so a fix that
-- special-cases one firm cannot pass.
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-a000-00000000b003","role":"authenticated"}', true);

-- T-27 control
select is(
  (select count(*) from taxpayers where id = '00000000-0000-4000-a000-00000000b002'),
  1::bigint,
  'T-27 Firm B reads its own taxpayer'
);

-- T-28
select is(
  (select count(*) from taxpayers where id = '00000000-0000-4000-a000-00000000a002'),
  0::bigint,
  'T-28 Firm B cannot read Firm A''s taxpayer'
);

-- T-29
select is(
  (select count(*) from compliance_cases where id = '00000000-0000-4000-a000-00000000a005'),
  0::bigint,
  'T-29 Firm B cannot read Firm A''s compliance case'
);

reset role;

-- ---------------------------------------------------------------------------
-- As a member of no organisation. firm_partner holds every capability, so if
-- the scoping leaned on capabilities rather than on the engagement join, this
-- caller would see everything.
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-a000-0000000c0003","role":"authenticated"}', true);

-- T-36
select is(
  (select count(*) from taxpayers),
  0::bigint,
  'T-36 a firm member with no organisation reads no taxpayer at all'
);

reset role;

select * from finish();
rollback;
