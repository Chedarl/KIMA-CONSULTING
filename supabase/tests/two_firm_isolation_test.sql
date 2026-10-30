-- T-22 .. T-50: two firms, two taxpayers. A member of one firm must never read
-- or write the other firm's records, down to the stored file.
--
-- T-37 .. T-50 cover what the first round left untested: a draft engagement
-- grants nothing, revoking an engagement removes access at once, invoices and
-- case tasks are scoped like everything else, and the public application queue
-- still works now that reads are scoped by organisation.
--
-- T-63 and T-64 are the two halves of R-48, and they disagree with each other on
-- purpose. The KIMA admin gets no access across firms, which is what the
-- organisation scoping bought. It still reads its own firm's client data,
-- because it holds case.view and access flows through firm membership, and
-- product rule 7 says it should hold none. T-64 records that as a fact rather
-- than a footnote, so whoever closes R-48 has to change a failing test and
-- notice they are changing the rule.
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

select plan(31);

-- ---------------------------------------------------------------------------
-- Fixture: two unrelated firms, each with one taxpayer, one engagement and one
-- reviewer. Nothing links firm A to taxpayer B.
-- ---------------------------------------------------------------------------
insert into auth.users (id, email) values
  ('00000000-0000-4000-a000-00000000a003', 'reviewer-a@example.test'),
  ('00000000-0000-4000-a000-00000000b003', 'reviewer-b@example.test'),
  ('00000000-0000-4000-a000-0000000c0003', 'orphan@example.test'),
  ('00000000-0000-4000-a000-00000000a00b', 'partner-a@example.test'),
  ('00000000-0000-4000-a000-00000000d001', 'kima-admin@example.test');

insert into organizations (id, name) values
  ('00000000-0000-4000-a000-00000000a001', 'Firm A'),
  ('00000000-0000-4000-a000-00000000b001', 'Firm B');

insert into taxpayers (id, legal_name) values
  ('00000000-0000-4000-a000-00000000a002', 'Taxpayer of Firm A'),
  ('00000000-0000-4000-a000-00000000b002', 'Taxpayer of Firm B'),
  ('00000000-0000-4000-a000-00000000a008', 'Prospect of Firm A');

-- The authorised grant, one per firm. This is what carries access. status
-- defaults to 'authorized'.
insert into engagements (organization_id, taxpayer_id) values
  ('00000000-0000-4000-a000-00000000a001', '00000000-0000-4000-a000-00000000a002'),
  ('00000000-0000-4000-a000-00000000b001', '00000000-0000-4000-a000-00000000b002');

-- A grant Firm A has drafted and nobody has accepted. The row exists, so the
-- firm can work on it; it carries no access to the prospect's records. See
-- T-37 and T-38.
insert into engagements (organization_id, taxpayer_id, status, authorized_at) values
  ('00000000-0000-4000-a000-00000000a001', '00000000-0000-4000-a000-00000000a008',
   'draft', null);

insert into firm_members (id, organization_id, person_label, email, role, auth_user_id) values
  ('00000000-0000-4000-a000-00000000a004', '00000000-0000-4000-a000-00000000a001',
   'Reviewer A', 'reviewer-a@example.test', 'firm_reviewer', '00000000-0000-4000-a000-00000000a003'),
  ('00000000-0000-4000-a000-00000000b004', '00000000-0000-4000-a000-00000000b001',
   'Reviewer B', 'reviewer-b@example.test', 'firm_reviewer', '00000000-0000-4000-a000-00000000b003');

-- A partner in Firm A. firm_reviewer does not hold engagement.create, so
-- claiming an application needs this caller. See T-46 and T-47.
insert into firm_members (id, organization_id, person_label, email, role, auth_user_id) values
  ('00000000-0000-4000-a000-00000000a00c', '00000000-0000-4000-a000-00000000a001',
   'Partner A', 'partner-a@example.test', 'firm_partner', '00000000-0000-4000-a000-00000000a00b');

-- The KIMA admin. It holds case.view, so without an explicit exclusion it
-- would read the public application queue. Product rule 7 gives it no
-- automatic access to client data, and an application is a prospective
-- client's data. See T-48.
insert into firm_members (id, organization_id, person_label, email, role, auth_user_id) values
  ('00000000-0000-4000-a000-00000000d002', '00000000-0000-4000-a000-00000000b001',
   'Kima Admin', 'kima-admin@example.test', 'kima_admin', '00000000-0000-4000-a000-00000000d001');

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

-- An invoice each. Billing is a separate read path: firm_reviewer does not
-- hold billing.view, so these are reached through the engagement, like
-- everything else.
insert into invoices (id, organization_id, taxpayer_id, number,
                      description_fr, description_en, total_minor,
                      issued_on, due_on) values
  ('00000000-0000-4000-a000-00000000a009', '00000000-0000-4000-a000-00000000a001',
   '00000000-0000-4000-a000-00000000a002', 'KMC-A-1',
   'Honoraires A', 'Fees A', 150000, '2026-03-01', '2026-03-31'),
  ('00000000-0000-4000-a000-00000000b009', '00000000-0000-4000-a000-00000000b001',
   '00000000-0000-4000-a000-00000000b002', 'KMC-B-1',
   'Honoraires B', 'Fees B', 150000, '2026-03-01', '2026-03-31');

-- A task each. case_tasks names only a case, so it reaches its taxpayer
-- through compliance_cases rather than directly.
insert into case_tasks (id, case_id, title) values
  ('00000000-0000-4000-a000-00000000a00a', '00000000-0000-4000-a000-00000000a005',
   'Chase the bank statement for A'),
  ('00000000-0000-4000-a000-00000000b00a', '00000000-0000-4000-a000-00000000b005',
   'Chase the bank statement for B');

-- Applications. Every application from the public wizard arrives owned by no
-- firm, which is why scoping reads by organisation alone would empty the
-- review queue. Two unassigned, so T-47 can claim one and T-50 still has one
-- to look at, and one already claimed by Firm B.
insert into registrations (id, organization_id, applicant_name, taxpayer_type) values
  ('00000000-0000-4000-a000-0000000000a1', null,
   'Unclaimed Applicant', 'business_moral'),
  ('00000000-0000-4000-a000-0000000000a2', null,
   'Second Unclaimed Applicant', 'business_moral'),
  ('00000000-0000-4000-a000-0000000000b1', '00000000-0000-4000-a000-00000000b001',
   'Applicant of Firm B', 'business_moral');

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
-- Schema-qualified: 20261030020000 moved it to `private`, which is deliberately
-- not on the search_path, because PostgREST does not publish that schema.
select ok(
  not private.can_see_taxpayer('00000000-0000-4000-a000-00000000b002'),
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

-- T-37 a drafted grant is not an accepted one.
select is(
  (select count(*) from taxpayers where id = '00000000-0000-4000-a000-00000000a008'),
  0::bigint,
  'T-37 a draft engagement grants no access to the taxpayer'
);

-- T-38 control: the firm still sees the draft engagement row itself, or there
-- would be no screen on which to accept it.
select is(
  (select count(*) from engagements
    where taxpayer_id = '00000000-0000-4000-a000-00000000a008'),
  1::bigint,
  'T-38 control: Firm A reads the engagement it drafted'
);

-- T-39
select is(
  (select count(*) from invoices where id = '00000000-0000-4000-a000-00000000b009'),
  0::bigint,
  'T-39 Firm A cannot read Firm B''s invoice'
);

-- T-40 control
select is(
  (select count(*) from invoices where id = '00000000-0000-4000-a000-00000000a009'),
  1::bigint,
  'T-40 control: Firm A reads its own invoice'
);

-- T-41
select is(
  (select count(*) from case_tasks where id = '00000000-0000-4000-a000-00000000b00a'),
  0::bigint,
  'T-41 Firm A cannot read Firm B''s case task'
);

-- T-42 control
select is(
  (select count(*) from case_tasks where id = '00000000-0000-4000-a000-00000000a00a'),
  1::bigint,
  'T-42 control: Firm A reads its own case task'
);

-- T-44 the public application queue still reaches an unclaimed application.
select is(
  (select count(*) from registrations
    where id = '00000000-0000-4000-a000-0000000000a1'),
  1::bigint,
  'T-44 Firm A reads an application that belongs to no firm yet'
);

-- T-45 but not one another firm has already taken.
select is(
  (select count(*) from registrations
    where id = '00000000-0000-4000-a000-0000000000b1'),
  0::bigint,
  'T-45 Firm A cannot read an application claimed by Firm B'
);

-- T-43 the task write path, checked after the role is reset, like T-30.
update case_tasks set title = 'Retitled by the wrong firm'
 where id = '00000000-0000-4000-a000-00000000b00a';

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

select is(
  (select title from case_tasks where id = '00000000-0000-4000-a000-00000000b00a'),
  'Chase the bank statement for B',
  'T-43 Firm A cannot update Firm B''s case task'
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
-- As the KIMA admin. It holds case.view and belongs to Firm B, so only an
-- explicit exclusion keeps it out of the queue of prospective clients.
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-a000-00000000d001","role":"authenticated"}', true);

-- T-48
select is(
  (select count(*) from registrations where organization_id is null),
  0::bigint,
  'T-48 the KIMA admin reads no unclaimed application'
);

-- T-63 the half of R-48 that the organisation scoping settles: platform
-- administration is not a way into another firm's book. This caller is a member
-- of Firm B, and firm_partner-grade reach would not help it here, because reach
-- is per organisation now.
select is(
  (select count(*) from taxpayers where id = '00000000-0000-4000-a000-00000000a002'),
  0::bigint,
  'T-63 the KIMA admin reads no taxpayer of another firm'
);

-- T-64 the half that is NOT settled, asserted so that it cannot be forgotten.
-- kima_admin holds case.view, and member_has(cap, tp) asks only whether the
-- caller belongs to an organisation with a live engagement for that taxpayer.
-- So an admin who is a member of a firm reads that firm's clients like any
-- member, and product rule 7 ("a KIMA admin gets no automatic access to client
-- data") is not satisfied inside its own firm. R-48 is open and needs an owner
-- decision on what a KIMA admin is for. When it is answered, this test fails,
-- which is the point.
select is(
  (select count(*) from taxpayers where id = '00000000-0000-4000-a000-00000000b002'),
  1::bigint,
  'T-64 the KIMA admin still reads its own firm''s taxpayer (R-48, open)'
);

reset role;

-- ---------------------------------------------------------------------------
-- As Partner A. Claiming an application is the only write that is allowed to
-- touch a row belonging to no firm, and it must leave the row inside the
-- caller's own firm.
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-a000-00000000a00b","role":"authenticated"}', true);

-- T-46 claiming it for somebody else is not claiming it.
select throws_ok(
  $$ update registrations
        set organization_id = '00000000-0000-4000-a000-00000000b001'
      where id = '00000000-0000-4000-a000-0000000000a1' $$,
  '42501', null,
  'T-46 Partner A cannot assign an application to Firm B'
);

-- T-47 control: into its own firm it works, and the application is now Firm
-- A's to answer.
select lives_ok(
  $$ update registrations
        set organization_id = '00000000-0000-4000-a000-00000000a001'
      where id = '00000000-0000-4000-a000-0000000000a1' $$,
  'T-47 control: Partner A claims an unassigned application for Firm A'
);

reset role;

-- ---------------------------------------------------------------------------
-- Revocation. Firm B keeps its engagement row and loses its access the moment
-- revoked_at is set. Only revoked_at is set here, and status is left alone, so
-- this proves revoked_at alone is enough.
-- ---------------------------------------------------------------------------
update engagements set revoked_at = now()
 where organization_id = '00000000-0000-4000-a000-00000000b001';

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-a000-00000000b003","role":"authenticated"}', true);

-- T-49 the same read that passed as T-27 a moment ago.
select is(
  (select count(*) from taxpayers where id = '00000000-0000-4000-a000-00000000b002'),
  0::bigint,
  'T-49 revoking the engagement removes Firm B''s access at once'
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

-- T-50 and not the application queue either: belonging to no firm is not a
-- way in through the one path that names no organisation.
select is(
  (select count(*) from registrations where organization_id is null),
  0::bigint,
  'T-50 a firm member with no organisation reads no unclaimed application'
);

reset role;

select * from finish();
rollback;
