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

select plan(17);

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
  ('00000000-0000-4000-c000-00000000000a', 'Taxpayer of Grant Firm A'),
  ('00000000-0000-4000-c000-00000000000b', 'Taxpayer of Grant Firm B'),
  ('00000000-0000-4000-c000-00000000000d', 'Prospect no firm holds');

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
insert into engagements (id, organization_id, taxpayer_id) values
  ('00000000-0000-4000-c000-0000000000e3', '00000000-0000-4000-c000-0000000000a0',
   '00000000-0000-4000-c000-00000000000d');

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

-- T-82 the consent path. This is the one act that brings a second firm in.
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

-- T-75 and only now does the file open. Two firms hold this taxpayer, which is
-- the many-to-many the design wants -- reached through the taxpayer's consent.
select is(
  (select count(*) from taxpayers where id = '00000000-0000-4000-c000-00000000000b'),
  1::bigint,
  'T-75 Firm A reads Firm B''s taxpayer only after that taxpayer accepted'
);

reset role;

select * from finish();
rollback;
