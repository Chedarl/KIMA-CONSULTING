-- T-71 .. T-86: a firm cannot write itself a grant (F-01).
--
-- 20261029213000 closed the read path: a firm reaches a taxpayer only through
-- its own engagement. It left the engagement itself writable, and `status`
-- defaulted to 'authorized', so one INSERT naming any taxpayer id was a
-- complete bypass. These checks were run against a database replayed without
-- 20261030070000 first. Ten of the seventeen fail there, and the shape of the
-- failure is the finding:
--
--   T-86  have: authorized / <timestamp>   want: draft / no timestamp
--   T-71  no exception was raised          -- the self-grant itself
--   T-74  have: 1   want: 0                -- and Firm B's taxpayer is readable
--   T-76, T-78, T-81b, T-84: no exception was raised
--
-- T-72, T-73 and T-79 fail there too, with 23505 rather than 42501: T-71 has
-- already created the (Firm A, Firm B's taxpayer) row they each need, which is
-- itself a demonstration.
--
-- The four rules under test:
--   opening an engagement is drafting it (T-71, T-72, T-86);
--   only the taxpayer records acceptance (T-78, T-82, T-84);
--   a firm authorises alone only for a taxpayer no other firm holds
--     (T-76, T-77, T-83);
--   the row never moves, and a revocation is final (T-79, T-80, T-81).
--
-- The controls matter as much: T-73, T-77, T-82, T-83 and T-85 are the ordinary
-- firm and taxpayer journey, and a rule that simply refused everything would
-- fail them. T-85 is the distinction the guard turns on -- it refuses a row
-- *becoming* a grant, not a row that already is one, so an authorised
-- engagement's fee is still editable.

begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(37);

-- ---------------------------------------------------------------------------
-- Fixture. Two firms, each holding one taxpayer. A prospect no firm holds.
-- A portal identity for Firm B's taxpayer, because acceptance is theirs to
-- give and the tests need someone able to give it.
-- ---------------------------------------------------------------------------
insert into auth.users (id, email) values
  ('00000000-0000-4000-c000-0000000000a1', 'partner-a@grant.test'),
  ('00000000-0000-4000-c000-0000000000b1', 'partner-b@grant.test'),
  ('00000000-0000-4000-c000-0000000000c1', 'client-b@grant.test');

insert into organizations (id, name) values
  ('00000000-0000-4000-c000-0000000000a0', 'Grant Firm A'),
  ('00000000-0000-4000-c000-0000000000b0', 'Grant Firm B');

insert into taxpayers (id, legal_name) values
  -- A client Firm B held and then let go. T-126 and T-127 use it.
  ('00000000-0000-4000-c000-00000000000f', 'Former client of Grant Firm B'),
  ('00000000-0000-4000-c000-00000000000a', 'Taxpayer of Grant Firm A'),
  ('00000000-0000-4000-c000-00000000000b', 'Taxpayer of Grant Firm B'),
  ('00000000-0000-4000-c000-00000000000d', 'Prospect no firm holds'),
  -- A prospect that a stranger merely typed the NIU of. T-154 .. T-157 use it:
  -- the only other engagement on it is a draft, which granted nothing.
  ('00000000-0000-4000-c000-00000000000c', 'Prospect with a stranger''s draft'),
  -- A second prospect, kept untouched for T-106 and T-107.
  ('00000000-0000-4000-c000-00000000000e', 'Second prospect no firm holds'),
  ('00000000-0000-4000-c000-0000000000cc', 'Prospect for timestamp immutability');

insert into engagements (id, organization_id, taxpayer_id, status, authorized_at) values
  ('00000000-0000-4000-c000-0000000000e1', '00000000-0000-4000-c000-0000000000a0',
   '00000000-0000-4000-c000-00000000000a', 'authorized', now()),
  ('00000000-0000-4000-c000-0000000000e2', '00000000-0000-4000-c000-0000000000b0',
   '00000000-0000-4000-c000-00000000000b', 'authorized', now());

-- firm_partner holds engagement.create, engagement.authorize and
-- engagement.revoke. If any of these refusals came from a missing capability
-- rather than from the rule under test, this caller would not show it.
insert into firm_members (id, organization_id, person_label, email, role, auth_user_id) values
  ('00000000-0000-4000-c000-0000000000a2', '00000000-0000-4000-c000-0000000000a0',
   'Grant Partner A', 'partner-a@grant.test', 'firm_partner',
   '00000000-0000-4000-c000-0000000000a1'),
  ('00000000-0000-4000-c000-0000000000b2', '00000000-0000-4000-c000-0000000000b0',
   'Grant Partner B', 'partner-b@grant.test', 'firm_partner',
   '00000000-0000-4000-c000-0000000000b1');

insert into contacts (id, organization_id, full_name, email, auth_user_id) values
  ('00000000-0000-4000-c000-0000000000c2', '00000000-0000-4000-c000-0000000000b0',
   'Client of Firm B', 'client-b@grant.test', '00000000-0000-4000-c000-0000000000c1');
insert into contact_account_links (contact_id, taxpayer_id, portal_access) values
  ('00000000-0000-4000-c000-0000000000c2', '00000000-0000-4000-c000-00000000000b', true);

-- T-86 first, while the fixture is still being written as the owner: the
-- column default is what made every other route possible.
-- Firm B held this one and revoked. Not live, but it happened.
insert into engagements (id, organization_id, taxpayer_id, status, authorized_at, revoked_at) values
  ('00000000-0000-4000-c000-0000000000e6', '00000000-0000-4000-c000-0000000000b0',
   '00000000-0000-4000-c000-00000000000f', 'revoked', now(), now());

-- Firm B typed this one's NIU in the wizard and stopped. A draft, both dates
-- null: nothing was ever granted to anybody.
insert into engagements (id, organization_id, taxpayer_id, status, authorized_at, accepted_at) values
  ('00000000-0000-4000-c000-0000000000e8', '00000000-0000-4000-c000-0000000000b0',
   '00000000-0000-4000-c000-00000000000c', 'draft', null, null);

insert into engagements (id, organization_id, taxpayer_id) values
  ('00000000-0000-4000-c000-0000000000e3', '00000000-0000-4000-c000-0000000000a0',
   '00000000-0000-4000-c000-00000000000d'),
  ('00000000-0000-4000-c000-0000000000e5', '00000000-0000-4000-c000-0000000000a0',
   '00000000-0000-4000-c000-00000000000e');

select is(
  (select status || ' / ' || coalesce(authorized_at::text, 'no timestamp')
     from engagements where id = '00000000-0000-4000-c000-0000000000e3'),
  'draft / no timestamp',
  'T-86 an engagement inserted without a status is a draft, not a grant'
);

-- ---------------------------------------------------------------------------
-- As Partner A.
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-c000-0000000000a1","role":"authenticated"}', true);

-- T-71 the self-grant itself: one INSERT, and Firm B's client is Firm A's.
select throws_ok(
  $$ insert into engagements (organization_id, taxpayer_id, status, authorized_at)
     values ('00000000-0000-4000-c000-0000000000a0',
             '00000000-0000-4000-c000-00000000000b', 'authorized', now()) $$,
  '42501', null,
  'T-71 Firm A cannot insert an authorised engagement against Firm B''s taxpayer'
);

-- T-72 and not against its own either. Opening a file is never the
-- authorisation, so the rule does not depend on whose taxpayer it is.
select throws_ok(
  $$ insert into engagements (organization_id, taxpayer_id, status, authorized_at)
     values ('00000000-0000-4000-c000-0000000000a0',
             '00000000-0000-4000-c000-00000000000d', 'authorized', now()) $$,
  '42501', null,
  'T-72 Firm A cannot insert an authorised engagement against any taxpayer'
);

-- T-73 control: drafting is the firm's to do, including against another firm's
-- taxpayer. A draft carries nothing, which is the point of allowing it.
select lives_ok(
  $$ insert into engagements (id, organization_id, taxpayer_id)
     values ('00000000-0000-4000-c000-0000000000e4',
             '00000000-0000-4000-c000-0000000000a0',
             '00000000-0000-4000-c000-00000000000b') $$,
  'T-73 control: Firm A drafts an engagement'
);

-- T-74 and the draft it just wrote buys no access.
select is(
  (select count(*) from taxpayers where id = '00000000-0000-4000-c000-00000000000b'),
  0::bigint,
  'T-74 the draft Firm A just wrote does not open Firm B''s taxpayer'
);

-- T-76 nor can Firm A authorise it: Firm B holds that taxpayer, and only the
-- taxpayer brings a second firm in.
select throws_ok(
  $$ update engagements set status = 'authorized', authorized_at = now()
      where id = '00000000-0000-4000-c000-0000000000e4' $$,
  '42501', null,
  'T-76 Firm A cannot authorise its own draft against Firm B''s taxpayer'
);

-- T-78 and it cannot manufacture the acceptance that would let it.
select throws_ok(
  $$ update engagements set accepted_at = now()
      where id = '00000000-0000-4000-c000-0000000000e4' $$,
  '42501', null,
  'T-78 Firm A cannot record the taxpayer''s acceptance for them'
);

-- T-79 nor point an engagement it does hold at the taxpayer it does not.
-- The policy passes here -- the organisation never changes -- so this is the
-- guard refusing, not RLS.
select throws_ok(
  $$ update engagements set taxpayer_id = '00000000-0000-4000-c000-00000000000b'
      where id = '00000000-0000-4000-c000-0000000000e1' $$,
  '42501', null,
  'T-79 an engagement cannot be moved to another taxpayer'
);

-- T-80 the same property on the other column. RLS refuses this one first,
-- because the new row names an organisation Firm A is not a member of; the
-- test asserts the property, not which layer catches it.
select throws_ok(
  $$ update engagements set organization_id = '00000000-0000-4000-c000-0000000000b0'
      where id = '00000000-0000-4000-c000-0000000000e1' $$,
  '42501', null,
  'T-80 an engagement cannot be moved to another firm'
);

-- T-126 and T-127: "no other firm holds them" means no other firm ever has.
--
-- The self-authorise shortcut exists so a firm opening a brand-new client file
-- is not blocked by an acceptance screen that does not exist yet. A client with
-- history is not that case. Until 20261030120000 the check asked only about
-- *live* engagements, so a client whose previous firm had revoked could be
-- picked up by any firm without consent -- and once taxpayer_id_for_niu()
-- existed, reachable by typing a NIU instead of guessing a UUID. Measured
-- before the fix: B self-authorised and read both the client and Firm A's
-- historical engagement.
select lives_ok(
  $$ insert into engagements (id, organization_id, taxpayer_id)
     values ('00000000-0000-4000-c000-0000000000e7',
             '00000000-0000-4000-c000-0000000000a0',
             '00000000-0000-4000-c000-00000000000f') $$,
  'T-126a control: Firm A may still draft against a client Firm B let go'
);

select throws_ok(
  $$ update engagements set status = 'authorized', authorized_at = now()
      where id = '00000000-0000-4000-c000-0000000000e7' $$,
  '42501', null,
  'T-126 but cannot authorise it alone: Firm B has held this client before'
);

select is(
  (select count(*) from taxpayers
    where id = '00000000-0000-4000-c000-00000000000f'),
  0::bigint,
  'T-127 and so reads nothing of that client'
);

-- T-77 control: the prospect. No other firm holds them, so the firm that
-- opened the file authorises it and starts work -- the onboarding path, intact.
select lives_ok(
  $$ update engagements set status = 'authorized', authorized_at = now()
      where id = '00000000-0000-4000-c000-0000000000e3' $$,
  'T-77 control: Firm A authorises its draft for a taxpayer no firm holds'
);

-- T-85 control: an authorised engagement is still an editable row. The guard
-- refuses a row becoming a grant, not a row that is one.
select lives_ok(
  $$ update engagements set fee_xaf = 250000
      where id = '00000000-0000-4000-c000-0000000000e1' $$,
  'T-85 control: the fee on an authorised engagement is still editable'
);

-- T-81 a revocation is final. Revoking first, as the firm legitimately may.
select lives_ok(
  $$ update engagements set status = 'revoked', revoked_at = now()
      where id = '00000000-0000-4000-c000-0000000000e3' $$,
  'T-81a control: Firm A revokes its own engagement'
);
select throws_ok(
  $$ update engagements set status = 'authorized', revoked_at = null
      where id = '00000000-0000-4000-c000-0000000000e3' $$,
  '42501', null,
  'T-81b a revoked engagement cannot be un-revoked'
);

reset role;

-- ---------------------------------------------------------------------------
-- As the taxpayer of Firm B, who has a draft from Firm A waiting.
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-c000-0000000000c1","role":"authenticated"}', true);

-- T-102 .. T-104: accepting is not a renegotiation. Each of these is the
-- acceptance of T-82 with one extra column, and each must be refused -- so the
-- client cannot reprice the engagement, reassign it, or authorise it. These
-- run before T-82 because once accepted_at is set, a second attempt is caught
-- by the "already recorded" rule instead and would prove nothing.
select throws_ok(
  $$ update engagements set status = 'accepted', accepted_at = now(), fee_xaf = 1
      where id = '00000000-0000-4000-c000-0000000000e4' $$,
  '42501', null,
  'T-102 a client cannot change the fee while accepting'
);

select throws_ok(
  $$ update engagements
        set status = 'accepted', accepted_at = now(), authorized_at = now()
      where id = '00000000-0000-4000-c000-0000000000e4' $$,
  '42501', null,
  'T-103 a client cannot authorise their own engagement while accepting'
);

select throws_ok(
  $$ update engagements
        set status = 'accepted', accepted_at = now(), assigned_to = 'Whoever I like'
      where id = '00000000-0000-4000-c000-0000000000e4' $$,
  '42501', null,
  'T-104 a client cannot reassign the engagement while accepting'
);

-- T-82 the consent path, unchanged and still allowed: the restriction above is
-- about the other columns, not about accepting.
select lives_ok(
  $$ update engagements set status = 'accepted', accepted_at = now()
      where id = '00000000-0000-4000-c000-0000000000e4' $$,
  'T-82 the taxpayer accepts Firm A''s draft'
);

-- T-84 and having given it, cannot rewrite it. An acceptance is a dated fact.
select throws_ok(
  $$ update engagements set status = 'accepted', accepted_at = now() + interval '1 day'
      where id = '00000000-0000-4000-c000-0000000000e4' $$,
  '42501', null,
  'T-84 an acceptance already recorded cannot be changed'
);

reset role;

-- ---------------------------------------------------------------------------
-- Partner A again, now that the taxpayer has accepted.
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-c000-0000000000a1","role":"authenticated"}', true);

-- T-83 the refusal in T-76 was about consent, not about the firm. With the
-- acceptance recorded the same update goes through.
select lives_ok(
  $$ update engagements set status = 'authorized', authorized_at = now()
      where id = '00000000-0000-4000-c000-0000000000e4' $$,
  'T-83 with the taxpayer''s acceptance, Firm A authorises the same engagement'
);

-- T-106 the firm cannot say the client agreed. 23514, not 42501: this is the
-- CHECK constraint, which binds every writer rather than only the ones a
-- policy sees. The firm could already authorise this engagement alone (T-107),
-- so nothing is gained by the claim -- which is the point. It is the record
-- being false, not the access being wider.
select throws_ok(
  $$ update engagements set status = 'accepted'
      where id = '00000000-0000-4000-c000-0000000000e5' $$,
  '23514', null,
  'T-106 a firm cannot mark its own engagement accepted with no acceptance on file'
);

-- T-107 control: and authorising the same row alone is still allowed, because
-- no other firm holds that prospect. 'authorized' carries no acceptance
-- requirement, and that asymmetry is deliberate.
select lives_ok(
  $$ update engagements set status = 'authorized', authorized_at = now()
      where id = '00000000-0000-4000-c000-0000000000e5' $$,
  'T-107 control: the firm still authorises a prospect no other firm holds'
);

-- T-75 and only now does the file open. Two firms hold this taxpayer, which is
-- the many-to-many the design wants -- reached through the taxpayer's consent.
select is(
  (select count(*) from taxpayers where id = '00000000-0000-4000-c000-00000000000b'),
  1::bigint,
  'T-75 Firm A reads Firm B''s taxpayer only after that taxpayer accepted'
);

-- ---------------------------------------------------------------------------
-- T-154 .. T-158: a stranger's draft is not a grant, so it blocks nobody.
--
-- 20261030120000 replaced "currently holds" with "has a row", which closed the
-- escalation T-126 covers and opened the opposite fault: every firm that types
-- a registered NIU leaves a draft behind, and those drafts counted as holding
-- the client. Reproduced before fixing, against a replayed schema -- the firm
-- refused here is the client's OWN former accountant:
--
--   A opened, taxpayer = 813e9bfc-...
--   A revoked, status = revoked
--   C outcome = already_registered        <- a stranger types the NIU
--   drafts on this taxpayer = 1
--   A REFUSED: 42501 / another firm has held this taxpayer
--
-- 20261030160000 asks the durable columns instead: ever granted, not currently
-- granting. A draft has authorized_at and accepted_at both null, so it never
-- blocks; a revoked engagement keeps its authorized_at, so it always does, and
-- T-126 above is the control for that half.
-- ---------------------------------------------------------------------------

-- T-154 the control: drafting was always allowed, so a failure here would mean
-- the fixture is wrong rather than the rule.
select lives_ok(
  $$ insert into engagements (id, organization_id, taxpayer_id)
     values ('00000000-0000-4000-c000-0000000000e9',
             '00000000-0000-4000-c000-0000000000a0',
             '00000000-0000-4000-c000-00000000000c') $$,
  'T-154 control: Firm A may draft against a prospect a stranger only drafted on'
);

-- T-155 the fix. This is the assertion that fails against 20261030120000.
select lives_ok(
  $$ update engagements set status = 'authorized', authorized_at = now()
      where id = '00000000-0000-4000-c000-0000000000e9' $$,
  'T-155 and may authorise it alone: a draft is not a grant, so nobody holds them'
);

-- T-156 and the access is real, not just an unrefused write.
select is(
  (select count(*) from taxpayers
    where id = '00000000-0000-4000-c000-00000000000c'),
  1::bigint,
  'T-156 and then actually reads the client file'
);

reset role;

-- T-157 and T-158 are the control that the fix did not go too far, read from
-- the stranger's own side. If a draft had become a grant, the first of these
-- would read 1 and the second would not raise.
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-c000-0000000000b1","role":"authenticated"}', true);

select is(
  (select count(*) from taxpayers
    where id = '00000000-0000-4000-c000-00000000000c'),
  0::bigint,
  'T-157 the stranger holding only a draft reads nothing of that client'
);

select throws_ok(
  $$ update engagements set status = 'authorized', authorized_at = now()
      where id = '00000000-0000-4000-c000-0000000000e8' $$,
  '42501', null,
  'T-158 and cannot authorise it now that Firm A has been granted'
);

-- T-159 .. T-165: Codex P1 -- status alone must not grant access;
-- a recorded authorization timestamp must never be erased or rewritten.
select lives_ok(
  $$ insert into engagements (id, organization_id, taxpayer_id)
     values ('00000000-0000-4000-c000-0000000000eb',
             '00000000-0000-4000-c000-0000000000b0',
             '00000000-0000-4000-c000-0000000000cc') $,
  'T-159 control: Firm B may create a draft for an unheld prospect'
);

select throws_ok(
  $$ update engagements set status = 'authorized'
      where id = '00000000-0000-4000-c000-0000000000eb' $,
  '23514', null,
  'T-160 authorized status alone without a date never grants access'
);

select lives_ok(
  $$ update engagements set status = 'authorized', authorized_at = now()
      where id = '00000000-0000-4000-c000-0000000000eb' $,
  'T-161 control: a dated authorization for a free prospect works'
);

select throws_ok(
  $$ update engagements set authorized_at = null
      where id = '00000000-0000-4000-c000-0000000000eb' $,
  '42501', null,
  'T-162 a firm cannot clear an authorization date to hide a prior grant'
);

select throws_ok(
  $$ update engagements set authorized_at = now() + interval '1 day'
      where id = '00000000-0000-4000-c000-0000000000eb' $,
  '42501', null,
  'T-163 a firm cannot rewrite the recorded authorization date'
);

select lives_ok(
  $$ update engagements set status = 'expired'
      where id = '00000000-0000-4000-c000-0000000000eb' $,
  'T-164 expiry may change status without deleting the prior grant'
);

select is(
  (select count(*) from engagements
     where id = '00000000-0000-4000-c000-0000000000eb'
       and authorized_at is not null),
  1::bigint,
  'T-165 the dated grant survives a later non-granting status'
);

reset role;

select * from finish();
rollback;
