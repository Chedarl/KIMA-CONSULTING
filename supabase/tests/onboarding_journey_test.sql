-- T-108 .. T-116: the onboarding journey, as a signed-in firm member.
--
-- WHY THIS FILE EXISTS. Three defects reached production on this one path in a
-- single morning -- draftEngagement() writing a status the CHECK constraint
-- forbids, current_firm_intake_identity() resolving a member by display name,
-- and onboarding-wizard.tsx filtering on a column `authenticated` cannot
-- SELECT. Every one of them was found by reading code. None was caught by a
-- test, and the reason is the same for all three: the repository had unit tests
-- over pure functions and pgTAP tests over hand-written SQL, and nothing that
-- ran *the sequence the application actually performs, as the role it actually
-- performs it as, against the schema the migrations actually produce*.
--
-- This file is that. It walks components/live/onboarding-wizard.tsx `submit()`
-- step by step, as `authenticated` with a firm partner's claims, in order:
--
--   1  rpc current_firm_intake_identity()        -> the firm
--   2  insert taxpayers ... returning id         -> .select("id").single()
--   3  insert engagements (draftEngagement row)
--   4  insert organizer_answers
--   5  insert document_requests
--   6  insert case_events                        -> recordCaseEvent()
--   7  insert audit_events                       -> audit()
--
-- WHAT IT FOUND, writing it. Steps 2 and 4 to 7 were refused, so opening a
-- client file did not work on production at all:
--
--   Step 2  ERROR: new row violates row-level security policy for "taxpayers"
--           Not the WITH CHECK -- private.member_has('case.advance') is true,
--           and the same INSERT *without* RETURNING succeeds. Postgres applies
--           the SELECT policy to a row returned by RETURNING, and
--           can_see_taxpayer(id) needs a live engagement, which cannot exist
--           one statement before the engagement is written.
--
--   Steps 4-7  ERROR: new row violates row-level security policy
--           can_see_taxpayer() is false. 20261030070000 made an engagement
--           open as a draft, and a draft grants nothing -- which is exactly
--           what stops a firm self-granting by drafting against someone
--           else's client (T-74).
--
-- Both are closed by 20261030110000, on the owner's decision that opening a
-- file for a brand-new client authorises the engagement: public.open_client_file()
-- creates the taxpayer and its authorised engagement atomically, as the caller,
-- with every policy still applying. Step 2 below is now that call, which is
-- what the wizard should send.
--
-- T-115 and T-116 are the controls that must hold however this path is built:
-- whatever access the onboarding firm gains, another firm gains none of it.
-- T-110 keeps the draft-engagement shape of lib/engagements.ts under test for
-- the engagements screen, which still drafts and authorises in two acts.

begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(11);

-- ---------------------------------------------------------------------------
-- Fixture: one firm, one partner. A second firm's partner stands by as the
-- outsider for T-115.
-- ---------------------------------------------------------------------------
insert into auth.users (id, email) values
  ('00000000-0000-4000-9000-0000000000a1', 'partner-a@onb.test'),
  ('00000000-0000-4000-9000-0000000000b1', 'partner-b@onb.test');

insert into organizations (id, name) values
  ('00000000-0000-4000-9000-0000000000a0', 'Onboarding Firm A'),
  ('00000000-0000-4000-9000-0000000000b0', 'Onboarding Firm B');

insert into firm_members
  (id, organization_id, person_label, email, role, auth_user_id) values
  ('00000000-0000-4000-9000-0000000000a2', '00000000-0000-4000-9000-0000000000a0',
   'Onb Partner A', 'partner-a@onb.test', 'firm_partner',
   '00000000-0000-4000-9000-0000000000a1'),
  ('00000000-0000-4000-9000-0000000000b2', '00000000-0000-4000-9000-0000000000b0',
   'Onb Partner B', 'partner-b@onb.test', 'firm_partner',
   '00000000-0000-4000-9000-0000000000b1');

-- ---------------------------------------------------------------------------
-- As Partner A, signed in. Everything below runs under RLS as `authenticated`.
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-9000-0000000000a1","role":"authenticated"}', true);

-- Step 1. T-108 the wizard's first call. It resolves the firm from auth.uid()
-- and must return exactly one row, the caller's own.
select is(
  (select organization_id from current_firm_intake_identity()),
  '00000000-0000-4000-9000-0000000000a0'::uuid,
  'T-108 step 1: the wizard resolves the signed-in member''s own firm'
);

-- Step 2. T-109 one call, and the id comes back. This is what replaced the
-- insert-with-RETURNING the wizard used to send.
select lives_ok(
  $$ select open_client_file(
       p_legal_name => 'Onb New Client',
       p_taxpayer_type => 'sarl',
       p_contact_name => 'Someone',
       p_contact_email => 'someone@onb.test'
     ) $$,
  'T-109 step 2: the firm opens the client file and gets the taxpayer id'
);

-- The same call again, keeping the id, so the rest of the journey can use it.
create temporary table onb_file as
  select open_client_file(
    p_legal_name => 'Onb Second Client',
    p_taxpayer_type => 'sarl',
    p_organizer => '{"taxpayer_type":"sarl"}'::jsonb
  ) as taxpayer_id;

-- T-117 and what it created: an authorised engagement in the caller's own firm,
-- with no acceptance claimed. accepted_at stays null -- consent is the
-- taxpayer's to give and this is the firm's act, not theirs.
select is(
  (select e.organization_id::text || ' / ' || e.status || ' / ' ||
          case when e.authorized_at is null then 'no date' else 'dated' end || ' / ' ||
          case when e.accepted_at is null then 'unaccepted' else 'ACCEPTED' end
     from engagements e join onb_file f on f.taxpayer_id = e.taxpayer_id),
  '00000000-0000-4000-9000-0000000000a0 / authorized / dated / unaccepted',
  'T-117 step 2 leaves an authorised engagement in the caller''s firm, no consent claimed'
);

-- T-118 and the firm can now read the taxpayer it just took on, which is the
-- whole point: before 20261030110000 it could not.
select is(
  (select count(*) from taxpayers t join onb_file f on f.taxpayer_id = t.id),
  1::bigint,
  'T-118 and the firm reads the client file it just opened'
);

-- Step 3. T-110 the engagement, exactly as lib/engagements.ts draftEngagement()
-- builds it: status 'draft', both timestamps explicitly null. This is the
-- assertion that would have caught status 'pending' before it shipped.
insert into taxpayers (id, legal_name, profile_verified) values
  ('00000000-0000-4000-9000-00000000000d', 'Onb Draft Target', false);
select lives_ok(
  $$ insert into engagements
       (organization_id, taxpayer_id, status, authorized_at, revoked_at,
        accepted_at, service_code, scope_note, fee_xaf, assigned_to)
     values ('00000000-0000-4000-9000-0000000000a0',
             '00000000-0000-4000-9000-00000000000d',
             'draft', null, null, null, null, null, null, null) $$,
  'T-110 the draft engagement draftEngagement() builds is still accepted'
);

-- Steps 4 to 7. T-111 .. T-114. All four are refused while the engagement is a
-- draft, because can_see_taxpayer() is false and every one of these policies
-- asks it.
select lives_ok(
  $$ insert into organizer_answers (taxpayer_id, question_key, answer)
     values ((select taxpayer_id from onb_file), 'taxpayer_type', 'sarl') $$,
  'T-111 step 4: the firm stores the organizer answers it just collected'
);

select lives_ok(
  $$ insert into document_requests
       (taxpayer_id, organization_id, label_fr, label_en, status, responsible, due_on)
     values ((select taxpayer_id from onb_file),
             '00000000-0000-4000-9000-0000000000a0',
             'Relevé bancaire', 'Bank statement', 'requested', 'taxpayer',
             '2026-11-13') $$,
  'T-112 step 5: the firm raises the document requests the organizer derived'
);

-- The row buildEvent() actually produces for recordCaseEvent({kind:'note_added'}):
-- dimension 'note', visibility 'client', to_value null. Taken from the module
-- rather than guessed -- an earlier draft of this test wrote dimension
-- 'document' and was refused by event_records_outcome, which is the constraint
-- doing its job on a fixture that did not match the code.
select lives_ok(
  $$ insert into case_events
       (organization_id, taxpayer_id, dimension, kind, actor_role, actor_label,
        visibility, reason)
     values ('00000000-0000-4000-9000-0000000000a0',
             (select taxpayer_id from onb_file),
             'note', 'note_added', 'firm_partner', 'Onb Partner A', 'client',
             'Dossier ouvert / File opened') $$,
  'T-113 step 6: recordCaseEvent() logs that the file was opened'
);

select lives_ok(
  $$ insert into audit_events
       (taxpayer_id, organization_id, actor, actor_member_id, action, resource_type)
     values ((select taxpayer_id from onb_file),
             '00000000-0000-4000-9000-0000000000a0',
             'firm', '00000000-0000-4000-9000-0000000000a2',
             'taxpayer.onboarded', 'taxpayer') $$,
  'T-114 step 7: audit() records who onboarded the taxpayer'
);

reset role;

-- ---------------------------------------------------------------------------
-- As Firm B's partner, who was nowhere near this onboarding.
--
-- The control that must hold however steps 2 to 7 are fixed: whatever access
-- the onboarding firm gains, another firm gains none of it.
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-9000-0000000000b1","role":"authenticated"}', true);

select is(
  (select count(*) from taxpayers t join onb_file f on f.taxpayer_id = t.id),
  0::bigint,
  'T-115 control: Firm B reads nothing of the taxpayer Firm A just onboarded'
);

select throws_ok(
  $$ insert into document_requests
       (taxpayer_id, organization_id, label_fr, label_en, status, responsible, due_on)
     values ((select taxpayer_id from onb_file),
             '00000000-0000-4000-9000-0000000000b0',
             'Injecté', 'Injected', 'requested', 'taxpayer', '2026-11-13') $$,
  '42501', null,
  'T-116 control: Firm B cannot raise a request against that taxpayer either'
);

reset role;

select * from finish();
rollback;
