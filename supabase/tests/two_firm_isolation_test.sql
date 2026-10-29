-- T-22 .. T-29: two firms, two taxpayers. A member of one firm must never read
-- the other firm's records.
--
-- SIX OF THESE TESTS FAIL TODAY, ON PURPOSE. They are wrapped in pgTAP TODO
-- blocks, so the suite stays green and a real regression elsewhere is still
-- visible. When the phase 1 fix lands, pgTAP reports them as "unexpectedly
-- succeeded" — that is the signal to delete the todo_start/todo_end lines and
-- let them gate the build for good.
--
-- Why they fail. Reading taxpayers, compliance_cases, document_requests and
-- documents is gated by can_see_taxpayer(tp), whose first branch is:
--
--     member_has('case.view')
--
-- member_has() is never passed the taxpayer or an organisation, and
-- current_firm_role() reads firm_members by auth_user_id alone, with no
-- organisation filter:
--
--     select role from firm_members where auth_user_id = auth.uid() and active limit 1
--
-- So the branch is true for any active firm member whose role holds
-- 'case.view' — which is every role, kima_admin included — and it is true for
-- every taxpayer, because no taxpayer is ever considered. Engagements are not
-- consulted on the read path at all.
--
-- The controls (T-22, T-26) must pass before and after the fix: each firm
-- keeps seeing the taxpayer it actually holds an engagement for.
--
-- Run with `supabase test db` (pgTAP). Synthetic data only; rolled back.

begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(8);

-- ---------------------------------------------------------------------------
-- Fixture: two unrelated firms, each with one taxpayer, one engagement and one
-- reviewer. Nothing links firm A to taxpayer B.
-- ---------------------------------------------------------------------------
insert into auth.users (id, email) values
  ('00000000-0000-4000-a000-00000000a003', 'reviewer-a@example.test'),
  ('00000000-0000-4000-a000-00000000b003', 'reviewer-b@example.test');

insert into organizations (id, name) values
  ('00000000-0000-4000-a000-00000000a001', 'Firm A'),
  ('00000000-0000-4000-a000-00000000b001', 'Firm B');

insert into taxpayers (id, legal_name) values
  ('00000000-0000-4000-a000-00000000a002', 'Taxpayer of Firm A'),
  ('00000000-0000-4000-a000-00000000b002', 'Taxpayer of Firm B');

-- The authorised grant, one per firm. This is what should carry access.
insert into engagements (organization_id, taxpayer_id) values
  ('00000000-0000-4000-a000-00000000a001', '00000000-0000-4000-a000-00000000a002'),
  ('00000000-0000-4000-a000-00000000b001', '00000000-0000-4000-a000-00000000b002');

insert into firm_members (id, organization_id, person_label, email, role, auth_user_id) values
  ('00000000-0000-4000-a000-00000000a004', '00000000-0000-4000-a000-00000000a001',
   'Reviewer A', 'reviewer-a@example.test', 'firm_reviewer', '00000000-0000-4000-a000-00000000a003'),
  ('00000000-0000-4000-a000-00000000b004', '00000000-0000-4000-a000-00000000b001',
   'Reviewer B', 'reviewer-b@example.test', 'firm_reviewer', '00000000-0000-4000-a000-00000000b003');

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

select todo_start('tenant isolation is not implemented on the read path (phase 1, backlog P2-5 / R-47)');

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

select todo_end();

reset role;

-- ---------------------------------------------------------------------------
-- As Reviewer B (Firm B) — the same hole, from the other side, so a fix that
-- merely special-cases one firm cannot pass.
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

select todo_start('tenant isolation is not implemented on the read path (phase 1, backlog P2-5 / R-47)');

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

select todo_end();

reset role;

select * from finish();
rollback;
