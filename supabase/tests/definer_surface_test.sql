-- T-51 .. T-60: the SECURITY DEFINER policy helpers are not API endpoints, and
-- the policies that call them still work.
--
-- 20261030020000 revokes EXECUTE from PUBLIC, anon and authenticated on eight
-- helpers that PostgREST was publishing at /rest/v1/rpc/<name>. The revoke
-- rests on a claim about Postgres: a policy expression is parsed once, by the
-- table owner, and EXECUTE is checked at parse time, so a policy keeps calling
-- a function the querying role may not call itself.
--
-- If that claim is wrong, every scoped read in the product returns nothing. So
-- this file asserts both halves. The refusals (T-51 to T-54, T-60) prove the
-- endpoints are closed. The controls (T-55 to T-59) prove the same reads still
-- work for a firm member, for a client, and for the anonymous demo, each of
-- which reaches a different revoked helper:
--
--   firm member -> can_see_taxpayer -> member_has -> current_firm_role
--   client      -> can_see_taxpayer -> client_taxpayer_ids
--   anonymous   -> can_see_taxpayer -> flag_enabled + demo_taxpayer_id
--
-- A control failing here means the revoke broke the product, not that a test is
-- stale. Run with `supabase test db` (pgTAP). Synthetic data only; rolled back.

begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(10);

-- ---------------------------------------------------------------------------
-- Fixture: one firm with an accepted engagement, one client of that taxpayer.
-- ---------------------------------------------------------------------------
insert into auth.users (id, email) values
  ('00000000-0000-4000-a000-00000000e001', 'reviewer-e@example.test'),
  ('00000000-0000-4000-a000-00000000e002', 'client-e@example.test');

insert into organizations (id, name) values
  ('00000000-0000-4000-a000-00000000e010', 'Firm E');

insert into taxpayers (id, legal_name) values
  ('00000000-0000-4000-a000-00000000e020', 'Taxpayer of Firm E');

insert into engagements (organization_id, taxpayer_id) values
  ('00000000-0000-4000-a000-00000000e010', '00000000-0000-4000-a000-00000000e020');

insert into firm_members (id, organization_id, person_label, email, role, auth_user_id) values
  ('00000000-0000-4000-a000-00000000e030', '00000000-0000-4000-a000-00000000e010',
   'Reviewer E', 'reviewer-e@example.test', 'firm_reviewer',
   '00000000-0000-4000-a000-00000000e001');

-- The client side. client_taxpayer_ids() walks contacts -> contact_account_links.
insert into contacts (id, organization_id, full_name, email, auth_user_id) values
  ('00000000-0000-4000-a000-00000000e040', '00000000-0000-4000-a000-00000000e010',
   'Client E', 'client-e@example.test', '00000000-0000-4000-a000-00000000e002');

insert into contact_account_links (contact_id, taxpayer_id, relationship, portal_access) values
  ('00000000-0000-4000-a000-00000000e040', '00000000-0000-4000-a000-00000000e020',
   'owner', true);

update app_flags set enabled = false where key = 'allow_demo_anon';

-- ---------------------------------------------------------------------------
-- The endpoints are closed.
-- ---------------------------------------------------------------------------
set local role anon;

-- T-51
select throws_ok(
  $$ select can_see_taxpayer('00000000-0000-4000-a000-00000000e020') $$,
  '42501', null,
  'T-51 anon cannot call can_see_taxpayer() directly'
);

-- T-54 the one that mattered most: it issues a one-time code.
select throws_ok(
  $$ select portal_request_code('Client E', 'P000000000001X') $$,
  '42501', null,
  'T-54 anon cannot call portal_request_code() directly'
);

-- T-60
select throws_ok(
  $$ select can_write_client_note('00000000-0000-4000-a000-00000000e020') $$,
  '42501', null,
  'T-60 anon cannot call can_write_client_note() directly'
);

reset role;

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-a000-00000000e001","role":"authenticated"}', true);

-- T-52
select throws_ok(
  $$ select member_has('case.view') $$,
  '42501', null,
  'T-52 a signed-in caller cannot call member_has() directly'
);

-- T-53
select throws_ok(
  $$ select client_taxpayer_ids() $$,
  '42501', null,
  'T-53 a signed-in caller cannot call client_taxpayer_ids() directly'
);

-- ---------------------------------------------------------------------------
-- And the policies that call them still work.
-- ---------------------------------------------------------------------------

-- T-55 the firm path, through member_has() and current_firm_role().
select is(
  (select count(*) from taxpayers where id = '00000000-0000-4000-a000-00000000e020'),
  1::bigint,
  'T-55 control: a firm member still reads its engaged taxpayer'
);

-- T-59 the one exposure that stays, answering for the engagement.
select ok(
  can_write_client_note('00000000-0000-4000-a000-00000000e020'),
  'T-59 can_write_client_note() answers for a signed-in firm member'
);

reset role;

-- T-56 the client path, through client_taxpayer_ids().
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-a000-00000000e002","role":"authenticated"}', true);

select is(
  (select count(*) from taxpayers where id = '00000000-0000-4000-a000-00000000e020'),
  1::bigint,
  'T-56 control: the client still reads its own taxpayer'
);

reset role;

-- ---------------------------------------------------------------------------
-- The anonymous demo path, through flag_enabled() and demo_taxpayer_id(), both
-- of which anon cannot call either.
-- ---------------------------------------------------------------------------

-- T-57 with the switch off, an anonymous visitor sees no taxpayer at all. This
-- is also the phase 1 exit criterion for the demo flags.
set local role anon;
select is(
  (select count(*) from taxpayers),
  0::bigint,
  'T-57 control: with allow_demo_anon off, anon reads no taxpayer'
);
reset role;

-- T-58 with it on, exactly the demo taxpayer and nothing else, so T-57 is the
-- flag working rather than the revoke having broken the anonymous path.
update app_flags set enabled = true where key = 'allow_demo_anon';

set local role anon;
select is(
  (select count(*) from taxpayers),
  1::bigint,
  'T-58 control: with allow_demo_anon on, anon reads the demo taxpayer only'
);
reset role;

select * from finish();
rollback;
