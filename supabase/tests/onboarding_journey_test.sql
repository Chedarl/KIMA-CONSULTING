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
-- WHAT IT FOUND, writing it. Steps 2 and 4 to 7 are refused today, so opening
-- a client file does not work on production at all. The TODO blocks below hold
-- those, with the measured error, so CI reports them without going red and
-- nobody can believe this path works while they stand. They come off with the
-- fix.
--
--   Step 2  ERROR: new row violates row-level security policy for "taxpayers"
--           Not the WITH CHECK -- private.member_has('case.advance') is true,
--           and the same INSERT *without* RETURNING succeeds. Postgres applies
--           the SELECT policy to a row returned by RETURNING, and
--           can_see_taxpayer(id) needs a live engagement, which cannot exist
--           one statement before the engagement is written. The wizard uses
--           .select("id").single(), so it needs the id it cannot have.
--
--   Steps 4-7  ERROR: new row violates row-level security policy
--           can_see_taxpayer() is false. 20261030070000 made an engagement
--           open as a draft, and a draft grants nothing -- which is exactly
--           what stops a firm self-granting by drafting against someone
--           else's client (T-74). The same rule leaves the onboarding firm
--           unable to set up the file it just opened.
--
-- The second is a consequence of closing F-01 and is a design question, not an
-- oversight: either opening a file for a brand-new client authorises the
-- engagement -- which rule 3 already permits, since no other firm holds that
-- taxpayer -- or the firm holds no access until the client accepts, and there
-- is no screen for that. Recorded for the owner rather than decided here.
--
-- T-108, T-110 and T-115 pass today and must keep passing: the identity
-- resolves, the draft engagement is accepted by the policy and the constraint,
-- and an outsider is refused throughout.

begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(9);

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

-- Step 2. T-109 the insert the wizard actually sends, RETURNING included.
select todo_start('step 2 is refused on production: RETURNING applies the SELECT policy, and no engagement exists yet');
select lives_ok(
  $$ insert into taxpayers
       (legal_name, taxpayer_type, contact_name, contact_email, profile_verified)
     values ('Onb New Client', 'sarl', 'Someone', 'someone@onb.test', false)
     returning id $$,
  'T-109 step 2: the firm creates the taxpayer and reads back its id'
);
select todo_end();

-- The row the wizard could not read back, written without RETURNING so the
-- rest of the journey has something to work on. This is the workaround the
-- fix removes, and it is here rather than in the fixture to keep the order of
-- the real sequence.
insert into taxpayers (id, legal_name, taxpayer_type, profile_verified) values
  ('00000000-0000-4000-9000-00000000000a', 'Onb New Client', 'sarl', false);

-- Step 3. T-110 the engagement, exactly as lib/engagements.ts draftEngagement()
-- builds it: status 'draft', both timestamps explicitly null. This is the
-- assertion that would have caught status 'pending' before it shipped.
select lives_ok(
  $$ insert into engagements
       (organization_id, taxpayer_id, status, authorized_at, revoked_at,
        accepted_at, service_code, scope_note, fee_xaf, assigned_to)
     values ('00000000-0000-4000-9000-0000000000a0',
             '00000000-0000-4000-9000-00000000000a',
             'draft', null, null, null, null, null, null, null) $$,
  'T-110 step 3: the draft engagement draftEngagement() builds is accepted'
);

-- Steps 4 to 7. T-111 .. T-114. All four are refused while the engagement is a
-- draft, because can_see_taxpayer() is false and every one of these policies
-- asks it.
select todo_start('steps 4-7 are refused on production: a draft engagement grants no access to the taxpayer it names');

select lives_ok(
  $$ insert into organizer_answers (taxpayer_id, question_key, answer)
     values ('00000000-0000-4000-9000-00000000000a', 'taxpayer_type', 'sarl') $$,
  'T-111 step 4: the firm stores the organizer answers it just collected'
);

select lives_ok(
  $$ insert into document_requests
       (taxpayer_id, organization_id, label_fr, label_en, status, responsible, due_on)
     values ('00000000-0000-4000-9000-00000000000a',
             '00000000-0000-4000-9000-0000000000a0',
             'Relevé bancaire', 'Bank statement', 'requested', 'taxpayer',
             '2026-11-13') $$,
  'T-112 step 5: the firm raises the document requests the organizer derived'
);

select lives_ok(
  $$ insert into case_events
       (organization_id, taxpayer_id, dimension, kind, actor_role, actor_label, visibility)
     values ('00000000-0000-4000-9000-0000000000a0',
             '00000000-0000-4000-9000-00000000000a',
             'document', 'note_added', 'firm_partner', 'Onb Partner A', 'internal') $$,
  'T-113 step 6: recordCaseEvent() logs that the file was opened'
);

select lives_ok(
  $$ insert into audit_events
       (taxpayer_id, organization_id, actor, actor_member_id, action, resource_type)
     values ('00000000-0000-4000-9000-00000000000a',
             '00000000-0000-4000-9000-0000000000a0',
             'firm', '00000000-0000-4000-9000-0000000000a2',
             'taxpayer.onboarded', 'taxpayer') $$,
  'T-114 step 7: audit() records who onboarded the taxpayer'
);

select todo_end();

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
  (select count(*) from taxpayers
    where id = '00000000-0000-4000-9000-00000000000a'),
  0::bigint,
  'T-115 control: Firm B reads nothing of the taxpayer Firm A just onboarded'
);

select throws_ok(
  $$ insert into document_requests
       (taxpayer_id, organization_id, label_fr, label_en, status, responsible, due_on)
     values ('00000000-0000-4000-9000-00000000000a',
             '00000000-0000-4000-9000-0000000000b0',
             'Injecté', 'Injected', 'requested', 'taxpayer', '2026-11-13') $$,
  '42501', null,
  'T-116 control: Firm B cannot raise a request against that taxpayer either'
);

reset role;

select * from finish();
rollback;
