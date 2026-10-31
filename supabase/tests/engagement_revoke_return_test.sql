-- T-300 .. T-313: the revoke-and-return journey, end to end (R-59, step 3).
--
-- Steps 1 and 2 are schema and function, already merged: 20261031010000 made
-- a revoked engagement history rather than a slot (T-270 .. T-274), and
-- 20261031020000 taught open_client_file() to look up only LIVE engagements,
-- so a returning client gets a fresh draft instead of the revoked row back.
-- This file is the journey those steps exist to make possible, run as the
-- role that performs it -- a signed-in firm partner, through the function the
-- wizard calls, never through hand-written rows:
--
--   1  the firm opens a client file, NIU given    -> opened, authorised
--   2  the firm revokes the engagement            -> history, not deletion
--   3  the client comes back: same firm, same NIU -> already_registered,
--      null taxpayer id, and a FRESH draft        -> the consent path again
--   4  the firm authorises the fresh draft        -> the client is back
--
-- Measured against a replay WITHOUT 20261031020000 (the function as
-- 20261030220000 left it), the unscoped lookup returns the REVOKED engagement
-- and no fresh draft is ever inserted. Five of these fail there: T-305 (the
-- id handed back IS the revoked row), T-306, T-307, T-311, T-312. T-310 even
-- passes -- the old code lets the firm "authorise" the revoked row in place,
-- flipping status while revoked_at stays set, a self-contradicting row that
-- grants nothing (R-59 defect (c), still reachable on main; T-311/T-312 are
-- what catch it downstream). The client can never come back, which is the
-- defect the owner's 31 Oct decision was meant to close.
--
-- Measured against a replay without 20261031010000 either, the SAME five
-- fail and T-304 still passes: the old unscoped lookup returns the revoked
-- row, so the fresh-draft insert is never attempted and the old one-slot
-- constraint never fires. Step 1 is still what gives step 2 room to work --
-- once the lookup is live-only, the insert would hit that constraint.
--
-- The two properties that must hold however this is built: the revoked row is
-- never touched (T-308), and the fresh draft grants nothing until authorised
-- (T-309) -- a returning client is not silently re-opened.
--
-- Synthetic data only; the whole file rolls back.

begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(14);

-- ---------------------------------------------------------------------------
-- Fixture: one firm, one partner. No taxpayer -- the journey creates it.
-- ---------------------------------------------------------------------------
insert into auth.users (id, email) values
  ('00000000-0000-4000-e200-0000000000a1', 'partner@revret.test');

insert into organizations (id, name) values
  ('00000000-0000-4000-e200-0000000000a0', 'Revoke-Return Firm');

-- firm_partner holds engagement.create, engagement.authorize and
-- engagement.revoke, so every step below exercises a rule rather than a
-- missing capability.
insert into firm_members (id, organization_id, person_label, email, role, auth_user_id) values
  ('00000000-0000-4000-e200-0000000000a2', '00000000-0000-4000-e200-0000000000a0',
   'RevRet Partner', 'partner@revret.test', 'firm_partner',
   '00000000-0000-4000-e200-0000000000a1');

-- ---------------------------------------------------------------------------
-- As the partner, signed in. Everything below runs under RLS.
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-e200-0000000000a1","role":"authenticated"}', true);

-- Step 1. The call itself is the setup; if it raises, the file fails here,
-- which is the journey being broken rather than an assertion being wrong.
create temporary table rr_open as
  select * from open_client_file(
    p_legal_name => 'Returning Client SARL',
    p_taxpayer_type => 'sarl',
    p_niu => 'P059900000000R',
    p_requests => '[]'::jsonb,
    p_note => 'Dossier ouvert / File opened');

select is(
  (select outcome || ' / ' || case when taxpayer_id is null then 'no id' else 'an id' end
     from rr_open),
  'opened / an id',
  'T-300 step 1: the firm opens the client file'
);

select is(
  (select e.status || ' / ' ||
          case when e.authorized_at is null then 'no date' else 'dated' end || ' / ' ||
          case when e.accepted_at is null then 'unaccepted' else 'ACCEPTED' end
     from engagements e join rr_open o on o.engagement_id = e.id),
  'authorized / dated / unaccepted',
  'T-301 step 1 leaves an authorised engagement, no consent claimed'
);

-- Step 2. The legitimate revoke, as T-81a established a firm may do.
select lives_ok(
  $$ update engagements set status = 'revoked', revoked_at = now()
      where id = (select engagement_id from rr_open) $$,
  'T-302 step 2: the firm revokes the engagement'
);

select is(
  (select count(*) from taxpayers t join rr_open o on o.taxpayer_id = t.id),
  0::bigint,
  'T-303 and the revoked grant opens nothing while the client is away'
);

-- Step 3. The client comes back. Same firm, same NIU -- typed with the messy
-- casing and padding a real re-entry carries, so normalisation is under test.
create temporary table rr_return as
  select * from open_client_file(
    p_legal_name => 'Returning Client SARL',
    p_niu => '  p059900000000r ',
    p_requests => '[]'::jsonb,
    p_note => 'Le client revient / The client is back');

select is(
  (select outcome || ' / returns ' ||
          case when taxpayer_id is null then 'null' else 'an id' end
     from rr_return),
  'already_registered / returns null',
  'T-304 step 3: the returning client is routed to ask, not duplicated'
);

select ok(
  (select engagement_id from rr_return) is not null
  and (select engagement_id from rr_return) <> (select engagement_id from rr_open),
  'T-305 and the engagement handed back is a FRESH row, not the revoked one'
);

select is(
  (select e.status || ' / ' ||
          case when e.authorized_at is null and e.accepted_at is null
                    and e.revoked_at is null then 'clean' else 'DIRTY' end
     from engagements e join rr_return r on r.engagement_id = e.id),
  'draft / clean',
  'T-306 the fresh engagement is a clean draft: nothing granted, nothing claimed'
);

select is(
  (select count(*) from engagements
    where organization_id = '00000000-0000-4000-e200-0000000000a0'
      and taxpayer_id = (select taxpayer_id from rr_open)),
  2::bigint,
  'T-307 two engagements exist for the pair: the history and the fresh draft'
);

select is(
  (select e.status || ' / ' ||
          case when e.authorized_at is null then 'no date' else 'dated' end || ' / ' ||
          case when e.revoked_at is null then 'LIVE' else 'still revoked' end
     from engagements e join rr_open o on o.engagement_id = e.id),
  'revoked / dated / still revoked',
  'T-308 the revoked row is untouched: its dated grant stays on record'
);

select is(
  (select count(*) from taxpayers t join rr_open o on o.taxpayer_id = t.id),
  0::bigint,
  'T-309 the fresh draft grants nothing yet: the client is not silently re-opened'
);

-- Step 4. The firm may authorise this draft alone: the only other engagement
-- on the client is its OWN revoked one, and own rows are excluded from the
-- held-by-another-firm check (20261030160000, T-126's carve-out).
select lives_ok(
  $$ update engagements set status = 'authorized', authorized_at = now()
      where id = (select engagement_id from rr_return) $$,
  'T-310 step 4: the firm authorises the fresh draft -- its own former client blocks nobody'
);

select is(
  (select count(*) from taxpayers t join rr_open o on o.taxpayer_id = t.id),
  1::bigint,
  'T-311 and reads the client again: the route back works end to end'
);

select is(
  (select count(*) from engagements
    where organization_id = '00000000-0000-4000-e200-0000000000a0'
      and taxpayer_id = (select taxpayer_id from rr_open)
      and revoked_at is null),
  1::bigint,
  'T-312 exactly one live engagement on the pair, however much history lies behind it'
);

reset role;

-- Read as the table owner, so the count is about the record and not about
-- what the firm's RLS happens to show.
select is(
  (select count(*) from taxpayers where upper(btrim(niu)) = 'P059900000000R'),
  1::bigint,
  'T-313 and there is still one client for the NIU, not two'
);

select * from finish();
rollback;
